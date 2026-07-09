const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Added urlencoded parsing just in case

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// HSSP Script Hosting
let hostedScriptCsv = '';

app.post('/api/host-script', (req, res) => {
    try {
        const scriptJson = req.body;
        if (!scriptJson || !scriptJson.actions) {
            return res.status(400).json({ error: 'Invalid script format' });
        }
        
        // Convert to CSV format (time in ms, position 0-100)
        const lines = scriptJson.actions.map(action => `${action.at},${action.pos}`);
        hostedScriptCsv = lines.join('\n');
        
        res.json({ success: true, url: `/api/hosted-script.csv` });
    } catch (err) {
        console.error('Error hosting script:', err);
        res.status(500).json({ error: 'Failed to host script' });
    }
});

app.get('/api/hosted-script.csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Needed for TheHandy
    res.send(hostedScriptCsv);
});

// Step 3: LLM Connect & Streams
app.post('/api/chat', async (req, res) => {
    const { messages, apiKey, llmUrl, llmModel, llmTemperature, systemPrompt } = req.body;
    
    if (!llmUrl) {
        return res.status(400).json({ error: 'LLM URL is required' });
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://handytime.local',
            'X-Title': 'HandyTime'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(llmUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: llmModel || 'mistralai/mistral-7b-instruct:free',
                temperature: llmTemperature !== undefined ? llmTemperature : 0.7,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ],
                stream: true,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: errText });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: 'Failed to communicate with LLM API' });
    }
});

// Voice Intent Endpoint
app.post('/api/voice-intent', async (req, res) => {
    const { transcript, apiKey, llmUrl, llmVoiceModel, currentSpeed, currentStroke } = req.body;
    
    if (!llmUrl) {
        return res.status(400).json({ error: 'LLM URL is required' });
    }

    const systemPrompt = `You are an AI controlling a haptic device. 
Current State: Speed ${currentSpeed}%, Stroke ${currentStroke}%.
The user will say a command. You must respond ONLY with a valid JSON object, nothing else.
Allowed keys in JSON:
- "action": string (one of: "adjust", "preset", "stop", "climax", "aftercare", "none")
- "speed": number (0-100), only if action is "adjust"
- "stroke": number (0-100), only if action is "adjust"
- "presetName": string (one of: "tease", "blow", "slow_deep", "pounding", "vibrate", "edging", "mix", "random", "organic"), only if action is "preset"

Example User: "go a bit faster and deeper"
Example Output: {"action":"adjust", "speed": ${Math.min(100, currentSpeed + 20)}, "stroke": ${Math.min(100, currentStroke + 20)}}`;

    try {
        const headers = {
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://handytime.local',
            'X-Title': 'HandyTime Voice'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(llmUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: llmVoiceModel || 'mistralai/mistral-7b-instruct:free',
                temperature: 0.1,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: transcript }
                ],
                stream: false,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: errText });
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            res.json(parsed);
        } catch (e) {
            console.error("Failed to parse JSON from LLM:", content);
            res.status(500).json({ error: 'LLM did not return valid JSON' });
        }

    } catch (error) {
        console.error('Voice Intent API Error:', error);
        res.status(500).json({ error: 'Failed to communicate with LLM API' });
    }
});

// STT Endpoint
app.post('/api/stt', upload.single('audio'), async (req, res) => {
    try {
        const { googleApiKey } = req.body;
        if (!googleApiKey) return res.status(400).json({ error: 'Missing Google API Key' });
        
        const audioContent = req.file.buffer.toString('base64');
        
        const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: { encoding: 'WEBM_OPUS', languageCode: 'en-US' },
                audio: { content: audioContent }
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'STT Error');

        const transcription = data.results?.map(r => r.alternatives[0].transcript).join('\n') || '';
            
        res.json({ text: transcription });
    } catch (error) {
        console.error('STT Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Settings Endpoints
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const settingsPath = path.join(dataDir, 'settings.json');

app.get('/api/settings', (req, res) => {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({});
        }
    } catch (err) {
        console.error('Error reading settings:', err);
        res.status(500).json({ error: 'Failed to read settings' });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// TTS Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, ttsProvider, googleApiKey, googleTtsType = 'Neural2', googleVoice = 'F', kokoroUrl, kokoroVoice } = req.body;
        
        if (ttsProvider === 'Kokoro') {
            if (!kokoroUrl) return res.status(400).json({ error: 'Missing Kokoro URL' });
            
            const response = await fetch(kokoroUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'kokoro',
                    input: text,
                    voice: kokoroVoice || 'af_bella',
                    response_format: 'mp3'
                })
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Kokoro TTS Error');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);
            res.set('Content-Type', 'audio/mpeg');
            res.send(audioBuffer);
            
        } else {
            if (!googleApiKey) return res.status(400).json({ error: 'Missing Google API Key' });

            const voiceName = `en-US-${googleTtsType}-${googleVoice}`;

            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text },
                    voice: { languageCode: 'en-US', name: voiceName },
                    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 }
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'TTS Error');

            const audioBuffer = Buffer.from(data.audioContent, 'base64');
            res.set('Content-Type', 'audio/mpeg');
            res.send(audioBuffer);
        }
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });
}

app.listen(port, () => {
    console.log(`Backend proxy running on http://localhost:${port}`);
});