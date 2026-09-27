// Stash integration: load a Stash scene's video and funscript into the
// Scripter, and save a fixed script back next to the video.
//
// Only a scene ID ever comes from the browser. Every file path is looked up
// from Stash by that ID, so this can never be asked to read or write a path of
// the caller's choosing. Keep it that way.
//
// Off unless a Stash URL and API key are set in Settings. Saving back is off
// unless STASH_MEDIA_ROOTS lists the library folders, mounted into this
// container at the same paths Stash uses (e.g. "/data,/extravr"). The same
// mount also lets the video stream straight from disk instead of via Stash.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const settingsPath = path.join(__dirname, 'data', 'settings.json');

const mediaRoots = (process.env.STASH_MEDIA_ROOTS || '')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => path.posix.normalize(r).replace(/\/+$/, ''));

// Headers worth passing through when proxying the video. Range and the
// content-range family are what make seeking work.
const STREAM_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

function stashConfig() {
    let settings = {};
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
        // No settings yet: the integration is simply off.
    }
    const url = (settings.stashUrl || '').trim().replace(/\/+$/, '');
    const apiKey = (settings.stashApiKey || '').trim();
    return url && apiKey ? { url, apiKey } : null;
}

async function stashGraphql(config, query, variables) {
    const response = await fetch(`${config.url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ApiKey: config.apiKey },
        body: JSON.stringify({ query, variables })
    });
    if (!response.ok) throw new Error(`Stash returned ${response.status}`);
    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0].message);
    return result.data;
}

async function findScene(config, id) {
    const data = await stashGraphql(config, `
        query FindScene($id: ID!) {
            findScene(id: $id) { id title interactive files { path basename } }
        }
    `, { id });
    return data.findScene;
}

function isUnderMediaRoot(p) {
    return mediaRoots.some(root => p === root || p.startsWith(root + '/'));
}

// Where the funscript for a video lives: same folder, same name. That is the
// only place Stash looks for one.
function funscriptPathFor(videoPath) {
    const parsed = path.posix.parse(videoPath);
    return path.posix.join(parsed.dir, parsed.name + '.funscript');
}

// Keep the script being replaced. Never overwrite an older backup: the first
// .bak is the original, which is the one most worth keeping.
function backupExisting(target) {
    if (!fs.existsSync(target)) return null;
    let backup = target + '.bak';
    if (fs.existsSync(backup)) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
        backup = `${target}.${stamp}.bak`;
    }
    fs.copyFileSync(target, backup);
    return backup;
}

function isValidFunscript(body) {
    return body
        && Array.isArray(body.actions)
        && body.actions.every(a => a
            && Number.isFinite(a.at) && a.at >= 0
            && Number.isFinite(a.pos) && a.pos >= 0 && a.pos <= 100);
}

const router = express.Router();

// These routes read your Stash library and write into it, so unlike the rest
// of the API they are same-origin only. Without this, any web page open in the
// same browser could call them — the app's global CORS policy allows every
// origin, and on localhost:3001 there is no Basic Auth in front.
router.use((req, res, next) => {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') {
        return res.status(403).json({ error: 'Cross-site request refused' });
    }
    const origin = req.headers.origin;
    if (origin) {
        let originHost = null;
        try { originHost = new URL(origin).host; } catch { /* malformed */ }
        if (originHost !== req.headers.host) {
            return res.status(403).json({ error: 'Cross-origin request refused' });
        }
    }
    next();
});

router.param('id', (req, res, next, id) => {
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid scene id' });
    next();
});

router.use((req, res, next) => {
    req.stash = stashConfig();
    if (!req.stash) {
        return res.status(503).json({ error: 'Stash is not configured — set its URL and API key in Settings' });
    }
    next();
});

router.get('/scenes/:id', async (req, res) => {
    try {
        const scene = await findScene(req.stash, req.params.id);
        if (!scene) return res.status(404).json({ error: 'Scene not found in Stash' });
        const file = scene.files[0];
        res.json({
            id: scene.id,
            title: scene.title || file?.basename || `Scene ${scene.id}`,
            basename: file?.basename || null,
            interactive: scene.interactive,
            canSave: !!file && isUnderMediaRoot(file.path) && fs.existsSync(file.path)
        });
    } catch (err) {
        console.error('Stash scene lookup failed:', err);
        res.status(502).json({ error: `Could not reach Stash: ${err.message}` });
    }
});

// Proxy a Stash endpoint for the scene, streaming the body straight through.
function proxyScene(stashPath, { passRange }) {
    return async (req, res) => {
        const controller = new AbortController();
        const onClientGone = () => controller.abort();
        res.on('close', onClientGone);
        try {
            const headers = { ApiKey: req.stash.apiKey };
            if (passRange && req.headers.range) headers.Range = req.headers.range;
            const response = await fetch(`${req.stash.url}/scene/${req.params.id}/${stashPath}`, {
                headers,
                signal: controller.signal
            });
            res.status(response.status);
            res.setHeader('X-Accel-Buffering', 'no');
            for (const h of STREAM_HEADERS) {
                const value = response.headers.get(h);
                if (value) res.setHeader(h, value);
            }
            if (!response.body) return res.end();
            Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
        } catch (err) {
            if (controller.signal.aborted) return; // client hung up (seek, close)
            console.error(`Stash ${stashPath} proxy failed:`, err);
            if (!res.headersSent) res.status(502).json({ error: `Could not reach Stash: ${err.message}` });
        } finally {
            res.off('close', onClientGone);
        }
    };
}

const proxyStream = proxyScene('stream', { passRange: true });

// The scene's video file as seen inside this container, or null when the
// library isn't mounted here (or Stash can't be reached to ask).
async function localVideoPath(config, id) {
    try {
        const scene = await findScene(config, id);
        const videoPath = scene?.files[0]?.path;
        const normalised = videoPath && path.posix.normalize(videoPath);
        if (normalised && isUnderMediaRoot(normalised) && fs.existsSync(normalised)) {
            return normalised;
        }
    } catch {
        // Callers fall back to going through Stash, which reports it being unreachable.
    }
    return null;
}

// Stream from disk when the library is mounted here (the same setup Save to
// Stash needs), and only go through Stash when it isn't. The proxy doubles
// every byte's trip — Stash reads it, sends it to us, we send it on — and a
// high-bitrate VR scene is where that shows up as stalls.
router.get('/scenes/:id/stream', async (req, res) => {
    const localPath = await localVideoPath(req.stash, req.params.id);
    if (!localPath) return proxyStream(req, res);

    // nginx otherwise spools the response to a temp file on its way through.
    res.setHeader('X-Accel-Buffering', 'no');
    res.sendFile(localPath, { dotfiles: 'allow' }, (err) => {
        // A seek or closed tab aborts mid-send; that's not a failure.
        if (!err || res.headersSent) return;
        console.error('Stash local stream failed:', err);
        res.status(err.status || 500).json({ error: 'Could not read the video file' });
    });
});
// The Scripter's Audio mode only needs the soundtrack's loudness, but a VR
// scene runs to several GB — more than a browser will hold in one buffer, let
// alone decode. ffmpeg pulls out just the audio, downmixed and resampled, and
// sends it as raw 16-bit mono PCM: a 15-minute scene comes to about 30 MB.
const AUDIO_SAMPLE_RATE = 16000;

router.get('/scenes/:id/audio', async (req, res) => {
    const localPath = await localVideoPath(req.stash, req.params.id);
    // Without the library mounted, ffmpeg reads the video from Stash itself.
    const input = localPath
        ? ['-i', localPath]
        : ['-headers', `ApiKey: ${req.stash.apiKey}\r\n`, '-i', `${req.stash.url}/scene/${req.params.id}/stream`];

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        ...input,
        '-map', '0:a:0', '-ac', '1', '-ar', String(AUDIO_SAMPLE_RATE),
        '-f', 's16le', 'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    ffmpeg.stderr.on('data', chunk => { stderr += chunk; });

    // Headers wait for the first bytes, so a file ffmpeg can't read still gets
    // a proper error status rather than an empty 200.
    ffmpeg.stdout.once('data', () => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Sample-Rate', String(AUDIO_SAMPLE_RATE));
        res.setHeader('X-Accel-Buffering', 'no');
    });
    ffmpeg.stdout.pipe(res, { end: false });

    let clientGone = false;
    const onClientGone = () => {
        clientGone = true;
        ffmpeg.kill('SIGKILL');
    };
    res.on('close', onClientGone);

    ffmpeg.on('error', (err) => {
        res.off('close', onClientGone);
        console.error('Could not start ffmpeg:', err);
        if (!res.headersSent) res.status(500).json({ error: `Could not start ffmpeg: ${err.message}` });
        else res.destroy();
    });

    ffmpeg.on('close', (code, signal) => {
        res.off('close', onClientGone);
        // A spawn failure has already been answered by the error handler.
        if (clientGone || res.writableEnded) return;
        if (code === 0) return res.end();
        const detail = stderr.trim().split('\n').pop() || `ffmpeg exited with ${code ?? signal}`;
        console.error(`Audio extraction failed for scene ${req.params.id}:`, stderr.trim());
        // Mid-stream, the only way to tell the browser is to cut it off.
        if (res.headersSent) return res.destroy();
        const noAudio = /matches no streams/i.test(stderr);
        res.status(noAudio ? 422 : 500).json({
            error: noAudio ? 'This video has no audio track' : `Audio extraction failed: ${detail}`
        });
    });
});

router.get('/scenes/:id/funscript', proxyScene('funscript', { passRange: false }));

// Long videos make funscripts well past express.json()'s 100kb default.
router.post('/scenes/:id/funscript', express.json({ limit: '20mb' }), async (req, res) => {
    // A JSON body can't be sent cross-site by a plain HTML form, so requiring
    // it rules out form-post CSRF even where the checks above see no headers.
    if (!req.is('application/json')) {
        return res.status(415).json({ error: 'Expected application/json' });
    }
    if (mediaRoots.length === 0) {
        return res.status(503).json({ error: 'Saving to Stash is off: STASH_MEDIA_ROOTS is not set on the server' });
    }
    if (!isValidFunscript(req.body)) {
        return res.status(400).json({ error: 'Not a valid funscript' });
    }

    try {
        const scene = await findScene(req.stash, req.params.id);
        const videoPath = scene?.files[0]?.path;
        if (!videoPath) return res.status(404).json({ error: 'Scene has no file in Stash' });

        const normalised = path.posix.normalize(videoPath);
        if (!isUnderMediaRoot(normalised)) {
            return res.status(403).json({ error: `${videoPath} is outside STASH_MEDIA_ROOTS` });
        }
        if (!fs.existsSync(normalised)) {
            return res.status(500).json({
                error: `${videoPath} is not visible inside HandyHub — mount the library at the same path Stash uses`
            });
        }

        const target = funscriptPathFor(normalised);
        const backup = backupExisting(target);

        // Write beside it and rename over, so a failed write never leaves a
        // half-written script where Stash will read it.
        const temp = `${target}.handyhub-tmp`;
        fs.writeFileSync(temp, JSON.stringify(req.body), 'utf8');
        fs.renameSync(temp, target);

        // Ask Stash to rescan the folder so it notices the script. The file is
        // already saved, so a failure here is a warning, not an error.
        let scanWarning = null;
        try {
            await stashGraphql(req.stash, `
                mutation Scan($paths: [String!]) { metadataScan(input: { paths: $paths }) }
            `, { paths: [path.posix.dirname(normalised)] });
        } catch (err) {
            scanWarning = `Saved, but Stash rescan failed: ${err.message}`;
        }

        res.json({ success: true, path: target, backup, scanWarning });
    } catch (err) {
        console.error('Saving funscript to Stash failed:', err);
        res.status(500).json({ error: `Save failed: ${err.message}` });
    }
});

module.exports = router;
