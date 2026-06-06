const express = require('express');
const cors = require('cors');
const multer = require('multer');
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
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

// Helper to get Google clients dynamically using passed credentials
const getGoogleClients = (credentialsStr) => {
    try {
        const credentials = JSON.parse(credentialsStr);
        const sttClient = new speech.SpeechClient({ credentials });
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
        return { sttClient, ttsClient };
    } catch (e) {
        throw new Error('Invalid Google API Credentials');
    }
};

// Step 3: LLM Connect & Streams
app.post('/api/chat', async (req, res) => {
    const { messages, apiKey, systemPrompt } = req.body;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'LLM API Key is required' });
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        const { googleCredentials } = req.body;
        if (!googleCredentials) return res.status(400).json({ error: 'Missing Google credentials' });
        
        const { sttClient } = getGoogleClients(googleCredentials);
        const audio = { content: req.file.buffer.toString('base64') };
        const config = { encoding: 'WEBM_OPUS', sampleRateHertz: 48000, languageCode: 'en-US' };
        
        const [response] = await sttClient.recognize({ audio, config });
        const transcription = response.results.map(r => r.alternatives[0].transcript).join('\n');
            
        res.json({ text: transcription });
    } catch (error) {
        console.error('STT Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// TTS Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, googleCredentials } = req.body;
        if (!googleCredentials) return res.status(400).json({ error: 'Missing Google credentials' });

        const { ttsClient } = getGoogleClients(googleCredentials);
        const request = {
            input: { text },
            voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        res.set('Content-Type', 'audio/mpeg');
        res.send(response.audioContent);
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