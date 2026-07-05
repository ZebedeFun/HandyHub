# HandyTime

HandyTime is an AI-powered companion app for TheHandy device. It features interactive roleplay with large language models, immersive text-to-speech (via Google API or local Kokoro server), and automatic hardware control. 

<img width="1215" height="569" alt="image" src="https://github.com/user-attachments/assets/a0ebd531-8327-40bb-8e17-b889aaecac3d" />

## Features & Modes

HandyTime offers 3 distinct modes accessible from the Home screen:

### 1. AI Partner
An interactive chat experience with your AI companion that physically connects with your device.
<img width="1206" height="700" alt="image" src="https://github.com/user-attachments/assets/1e9c5aa5-058d-495c-af54-9e896798466b" />

- **LLM Chat:** Connect to models via OpenRouter or Nano-GPT for dynamic text streaming.
- **Text-to-Speech:** Supports Google Cloud TTS or a self-hosted Kokoro TTS server.
- **Interactive Personas:** Choose between personas like Gentle Guide, Relentless Tease, or Strict Dominant.
- **Hardware Sync:** Automatically parses AI instructions to control TheHandy speed and depth using tags.

### 2. Handy Scripter
<img width="1311" height="951" alt="image" src="https://github.com/user-attachments/assets/06cf7839-cc47-4d8c-a740-ce430c048359" />

Upload a video and procedurally generate a funscript file to synchronize your device with the action on screen.

### 3. Handy Remote
<img width="1294" height="1274" alt="image" src="https://github.com/user-attachments/assets/bc5a99cb-bd9b-4800-a4ae-4491434370e1" />

A distraction-free, one-touch remote control with gestures and rhythm presets.
- **Audio React:** Syncs TheHandy speed to ambient noise or music through your microphone.
- **Speech Recognition:** Control TheHandy hands-free using voice commands! Just enable the microphone and say commands like "faster", "deeper", "stop", or call out preset names like "tease" and "pounding".
- **Rhythm Presets:** Instantly toggle between pre-configured movement patterns like 'Edging', 'Organic', and 'Random'.

## Installation

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- TheHandy Connection Key
- (Optional) OpenRouter API Key for LLMs
- (Optional) Google API Key for Google TTS

### Quick Start
1. Clone this repository:
   ```bash
   git clone https://github.com/zebede1980/HandyTime.git
   cd HandyTime
   ```

2. Set up the environment and data directories:
   ```bash
   cp .env.example .env
   cp docker-compose.example.yml docker-compose.yml
   mkdir -p data
   ```

3. Start the application:
   ```bash
   docker compose up -d --build
   ```

4. Access the web interface at `http://localhost:3001` (or whatever port you specified in `.env`).

## Configuration
All application settings are managed within the web interface (via the **Settings** gear icon):
- **Handy Connection Key:** Your device's connection key.
- **LLM Configuration:** Enter your OpenRouter API Key and preferred model (e.g., `mistralai/mistral-7b-instruct:free`).
- **TTS Provider:** Choose between Google API or Kokoro. If using Kokoro, point to your local endpoint (e.g., `http://localhost:8880/v1/audio/speech`).

### Optional Kokoro TTS Setup
If you don't already have Kokoro TTS running, you can deploy it automatically alongside HandyTime. Simply open your `docker-compose.yml` file, uncomment the `kokoro-tts` service block, and restart the container:
```bash
docker compose up -d
```

