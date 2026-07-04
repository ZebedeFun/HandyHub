---
name: handytime
description: Skill for developing the HandyTime project. HandyTime is a React + Vite + TailwindCSS frontend with a Node.js/Express backend, used as a companion app for TheHandy device. Activate this skill whenever the user asks to work on, modify, test, or deploy HandyTime.
---

# HandyTime Development Skill

## Project Overview

**HandyTime** is an AI-powered companion app for TheHandy device, featuring:
- LLM chat with streaming (via OpenRouter or compatible API)
- Speech-to-text (Google API)
- Text-to-speech (Google API or Kokoro)
- HSSP script hosting for TheHandy device

**Repository**: https://github.com/zebede1980/HandyTime  
**Working directory (edit here)**: `/home/ubuntu/HandyTime`  
**Docker deployment directory**: `/home/ubuntu/DockerSource/HandyTime`

---

## Project Structure

```
/home/ubuntu/HandyTime/
├── frontend/           # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── services/
│   │   └── index.css
│   ├── index.html
│   └── package.json
├── backend/            # Node.js + Express
│   └── server.js       # API proxy, TTS, STT, settings, HSSP hosting
├── docker-compose.yml
├── Dockerfile
└── package.json        # Root: runs both frontend & backend concurrently
```

---

## CRITICAL: Testing Workflow

> **You CANNOT test changes by running the app directly.** The live instance runs
> inside Docker in a separate directory. All testing must go through the
> git → pull → rebuild cycle described below.

### Step-by-step deploy process

1. **Make your code changes** in `/home/ubuntu/HandyTime`

2. **Stage and commit all changes**:
   ```bash
   git -C /home/ubuntu/HandyTime add -A
   git -C /home/ubuntu/HandyTime commit -m "describe your changes here"
   ```

3. **Push to GitHub**:
   ```bash
   git -C /home/ubuntu/HandyTime push origin main
   ```

4. **Pull and rebuild the Docker container**:
   ```bash
   git -C /home/ubuntu/DockerSource/HandyTime pull
   docker compose -f /home/ubuntu/DockerSource/HandyTime/docker-compose.yml up -d --build
   ```

5. **Verify** the container is running (optional but recommended):
   ```bash
   docker ps | grep -i handy
   ```

### Important notes
- Always commit with a meaningful message describing what changed.
- Always push **before** pulling in the DockerSource directory.
- The `docker compose up -d --build` command rebuilds the image and restarts the container.
- If the build fails, check logs with: `docker logs $(docker ps -qf name=handy)`

---

## Backend API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/host-script` | Host HSSP script as CSV for TheHandy |
| GET | `/api/hosted-script.csv` | Serve the hosted script |
| POST | `/api/chat` | Proxy LLM chat (streaming SSE) |
| POST | `/api/stt` | Speech-to-text via Google API |
| POST | `/api/tts` | Text-to-speech (Google or Kokoro) |
| GET | `/api/settings` | Read persisted settings |
| POST | `/api/settings` | Save settings to `settings.json` |

---

## Tech Stack Details

- **Frontend**: React 18, Vite, TailwindCSS, PostCSS
- **Backend**: Node.js, Express, multer (file uploads), cors
- **LLM**: OpenRouter-compatible API (streaming)
- **TTS**: Google Cloud TTS or Kokoro (self-hosted)
- **STT**: Google Cloud Speech-to-Text
- **Container**: Docker + docker-compose
