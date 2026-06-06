const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

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

// Step 3: LLM Connect & Streams
app.post('/api/chat', async (req, res) => {
    const { messages, apiKey, llmUrl, systemPrompt } = req.body;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'LLM API Key is required' });
    }
    if (!llmUrl) {
        return res.status(400).json({ error: 'LLM URL is required' });
    }

    try {
        const response = await fetch(llmUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://handytime.local',
                'X-Title': 'HandyTime'
            },
            body: JSON.stringify({
                model: 'mistralai/mistral-7b-instruct:free',
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
                config: { encoding: 'WEBM_OPUS', sampleRateHertz: 48000, languageCode: 'en-US' },
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

// TTS Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, googleApiKey, googleTtsType = 'Neural2', googleVoice = 'F' } = req.body;
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