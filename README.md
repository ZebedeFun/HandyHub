# HandyTime

HandyTime is an AI-powered companion app for [TheHandy](https://www.thehandy.com/) device. It combines interactive AI roleplay with large language models, immersive text-to-speech, and real-time hardware control — all running locally in Docker with no cloud dependency for the core app.

<img width="1215" height="569" alt="image" src="https://github.com/user-attachments/assets/a0ebd531-8327-40bb-8e17-b889aaecac3d" />

---

## Table of Contents

- [Features Overview](#features-overview)
- [Mode 1: AI Partner](#mode-1-ai-partner)
- [Mode 2: Handy Scripter](#mode-2-handy-scripter)
- [Mode 3: Handy Remote](#mode-3-handy-remote)
- [Installation](#installation)
- [Configuration](#configuration)
- [Optional: Kokoro TTS Setup](#optional-kokoro-tts-setup)
- [FAQ & Troubleshooting](#faq--troubleshooting)

---

## Features Overview

HandyTime offers **3 distinct modes** accessible from the Home screen:

| Mode | Description |
|---|---|
| 🤖 **AI Partner** | Fully autonomous AI experience — the AI talks and controls the device for you |
| 🎬 **Handy Scripter** | Upload a video and generate a synced funscript automatically |
| 🕹️ **Handy Remote** | Manual hands-free control via XY pad, presets, voice commands, and audio react |

**Core capabilities across all modes:**
- 🌙 Dark / Light mode toggle
- 💾 Settings persisted across container restarts (stored in `./data`)
- 📤 Import / Export settings as JSON for easy backup and transfer
- 🔄 Works with any OpenAI-compatible LLM API (OpenRouter, Nano-GPT, etc.)

---

## Mode 1: AI Partner

<img width="1206" height="700" alt="image" src="https://github.com/user-attachments/assets/1e9c5aa5-058d-495c-af54-9e896798466b" />

The AI Partner mode is a fully **passive, cinematic experience**. Once started, the AI drives everything — it generates continuous narrative, speaks it aloud via TTS, and simultaneously controls your device. You just sit back.

### How It Works

1. Select a **persona** from the dropdown
2. Press **START EXPERIENCE** — the AI begins generating scenes and speaking them
3. The AI embeds hidden hardware commands inside its text; these are parsed and sent to TheHandy in real time, then stripped from the displayed text so you never see them
4. The experience loops automatically — each scene flows seamlessly into the next
5. Press **Stop** at any time to halt everything instantly

### Personas

Choose your AI's personality and style before starting:

| Persona | Style |
|---|---|
| **Gentle Guide** | Slow, sensual, encouraging — low speed and gentle strokes |
| **Relentless Tease** | Alternates between intense bursts and sudden stops |
| **Strict Dominant** | Commanding, fast-paced, full strokes — you obey |
| **Call me Daddy** | Playful, submissive female partner, eager to please |
| **Loving Momma** | Nurturing, warm, affectionate — slow comforting rhythm |
| **Humiliation** | Cruel and mocking — unpredictable, frustrating |

> Persona selection is locked once the experience is active. Stop the session to switch.

### Controls

| Button | Action |
|---|---|
| **START EXPERIENCE** | Begins the AI session |
| **STOP** | Immediately stops audio, clears queue, and sends speed 0 to device |
| **Climax!** | Triggers an orgasm-encouragement scene at high speed/depth |
| **and Done!** | Follows up with aftercare/post-orgasm scene at low speed |
| 🔊 Volume slider | Adjusts TTS playback volume |
| 🔇 Mute button | Silences audio without stopping the session |
| **Test Mode** | Shows a live readout of the current device speed and stroke depth |

### Scene Delay

A configurable pause (0–10 seconds) is inserted between each AI-generated scene. Adjust this in Settings → **Scene Delay**.

### AI Hardware Control

> **Important:** In AI Partner mode, *you* do not control the device. The AI does it entirely.

The AI embeds hardware command tags directly in its generated text. These are parsed and executed by HandyTime, then removed before display:

- `[HANDY_SPEED: 0-100]` — sets the stroker speed
- `[HANDY_STROKE: 0-100]` — sets the stroke depth/zone

*Example internal AI output (you will never see this):*
> `[HANDY_SPEED: 80] [HANDY_STROKE: 100] Let's go much faster now.`

HandyTime's built-in system prompt engineering automatically instructs the LLM to use these tags correctly and place them at the start of each relevant sentence.

---

## Mode 2: Handy Scripter

<img width="1311" height="951" alt="image" src="https://github.com/user-attachments/assets/06cf7839-cc47-4d8c-a740-ce430c048359" />

The Handy Scripter lets you **upload any video file** and procedurally generate a `.funscript` that syncs TheHandy to the action on screen.

### How to Use

1. **Upload a video** — drag and drop, or click to browse. Any common format (MP4, WebM, etc.) works.
2. **Configure the script parameters** using the controls panel
3. Click **Generate Complete Script** — the script is generated instantly in the browser (no AI required)
4. **Preview** the script overlaid on the video using the heatmap and device simulator
5. **Sync to Device** — toggle "Sync to Handy" to push the script directly to your device via HSSP
6. **Download** — save the `.funscript` file for use in other players

### Script Parameters

| Parameter | Description |
|---|---|
| **Pattern Mode** | `Consistent` keeps the same feel throughout; `Build Over Time` gradually intensifies; `Random Phases` switches between intensities unpredictably |
| **Block Size** | Duration (seconds) of each distinct pattern block. Set to 0 for no blocks |
| **Transition Smoothing** | How long (seconds) to smoothly blend between blocks |
| **Base Speed** | Overall tempo of the generated script (1–10) |
| **Min / Max Stroke Length** | Range of individual stroke lengths in the script |
| **Chaos / Randomness** | How much variation is added to each stroke (0 = perfectly regular, 10 = highly varied) |
| **Min / Max Stroke Zone** | Physical limits of the stroke range (bottom and top positions) |
| **Cooldown End Zone** | Drops speed and intensity to minimum for the final N seconds of the video — useful for edging control |

### Live Preview

A **heatmap** view shows the generated script overlaid on the video timeline so you can visually inspect intensity and pattern throughout. A **device simulator** provides a real-time animated preview of what the device will do as you scrub through the video.

---

## Mode 3: Handy Remote

<img width="1294" height="1274" alt="image" src="https://github.com/user-attachments/assets/bc5a99cb-bd9b-4800-a4ae-4491434370e1" />

The Handy Remote is a **real-time, hands-free controller** for TheHandy with an intuitive XY touch pad, instant presets, voice commands, and audio-reactive mode.

Click the **?** help button in the top-right corner of the Remote for a full in-app guide.

### XY Pad

The central XY pad gives you direct real-time control:
- **X-axis (left/right)** — controls speed
- **Y-axis (up/down)** — controls stroke depth

Drag anywhere on the pad to set speed and depth simultaneously.

### Limits & Anchors

Fine-tune how the device responds to the XY pad:

| Control | Description |
|---|---|
| **Min / Max Speed** | Clamp the speed range so the pad only operates within your chosen limits |
| **Min / Max Depth** | Clamp the physical stroke zone top and bottom |
| **Anchor** | `Bottom` — strokes extend upward from a fixed bottom point. `Top` — strokes extend downward from a fixed top point. `Center` — strokes extend equally in both directions from the midpoint |

### Rhythm Presets

One-tap presets that instantly configure speed and stroke:

| Preset | Description |
|---|---|
| **Tease** | Slow and shallow — just a hint |
| **Blow** | Moderate speed, anchored from top, mid-depth |
| **Slow Deep** | Very slow, full depth |
| **Pounding** | Fast and full — maximum intensity |
| **Vibrate** | Maximum speed, minimal stroke — flutter sensation |
| **Mix** | Alternates between deep and shallow strokes on a 5-second cycle |
| **Edging** | Alternates between intense (80% speed, full depth) and a brief pause every 8 seconds |
| **Organic** | Smoothly wanders between random speed and stroke targets — feels natural and unpredictable |
| **Random** | Jumps to completely random speed and stroke values at a configurable interval |

### Voice Commands

Enable the microphone (🎤 button) to control the device completely hands-free using spoken commands.

> **Requires:** Google Chrome (or a Chromium browser with Google Speech access) on HTTPS or localhost.

| Command | Action |
|---|---|
| `"faster"` | Increase current speed by 20% |
| `"slower"` | Decrease current speed by 20% |
| `"deeper"` | Increase stroke depth by 20% |
| `"shallower"` / `"shorter"` | Decrease stroke depth by 20% |
| `"stop"` / `"pause"` | Stop the device immediately |
| `"climax"` | Set speed 80%, full depth — climax mode |
| `"done"` / `"finished"` | Switch to slow, shallow aftercare mode |
| `"tease"` | Activate Tease preset |
| `"blow"` | Activate Blow preset |
| `"deep"` / `"slow"` | Activate Slow Deep preset |
| `"pound"` / `"hard"` | Activate Pounding preset |
| `"flutter"` / `"vibrate"` | Activate Vibrate preset |
| `"edge"` / `"edging"` | Activate Edging preset |
| `"mix"` | Activate Mix preset |
| `"random"` | Activate Random preset |
| `"organic"` / `"magic"` | Activate Organic preset |

### Audio React

Enable **Audio React** (🎵 button) to have the device automatically respond to ambient sound levels picked up by your microphone — music, audio playback, or any other sound.

| Volume Level | Device Speed |
|---|---|
| Quiet (< 15/255) | 0% — paused |
| Low (15–40/255) | 30% — gentle |
| Medium (40–80/255) | 60% — moderate |
| Loud (> 80/255) | 100% — maximum |

> Audio React and Voice Commands share the microphone. Enable one at a time.

### Climax Controls

| Button | Action |
|---|---|
| 🔥 **Climax** | Sets speed to 80%, full depth for the climax moment |
| ✅ **and Done** | Switches to slow (20%), shallow (40%) aftercare mode |

---

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (v2)
- A **TheHandy Connection Key** (from the [Handy app](https://www.thehandy.com/))
- *(Optional)* An **OpenRouter** or **Nano-GPT** API key for AI Partner mode
- *(Optional)* A **Google Cloud API key** with Text-to-Speech and Speech-to-Text APIs enabled

### Quick Start

**1. Clone the repository:**
```bash
git clone https://github.com/ZebedeFun/HandyHub.git
cd HandyHub
```

**2. Set up configuration files:**
```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

**3. Create the persistent data directory:**
```bash
mkdir -p data
```

**4. Build and start the application:**
```bash
docker compose up -d --build
```

**5. Open HandyTime in your browser:**
```
http://localhost:3001
```

**6. Enter your settings via the ⚙️ gear icon** in the top right and save.

> The app will be accessible at `http://localhost:3001` by default. Change the port in `.env` if needed.

---

## Configuration

All settings are managed **inside the web interface** via the ⚙️ gear icon. Settings are saved to `./data/settings.json` and persist across container rebuilds.

### Device

| Setting | Description |
|---|---|
| **Handy Connection Key** | Your device's unique connection key from the Handy app |

### LLM (AI Partner Mode)

| Setting | Description |
|---|---|
| **LLM API Key** | Your API key for OpenRouter, Nano-GPT, or any OpenAI-compatible provider |
| **LLM URL Endpoint** | The API endpoint. Default: `https://openrouter.ai/api/v1/chat/completions` |
| **LLM Model** | Model identifier, e.g. `mistralai/mistral-7b-instruct:free` or `openai/gpt-4o` |
| **LLM Temperature** | Creativity/randomness of responses (0 = predictable, 2 = highly creative). Default: `0.7` |
| **Scene Delay** | Pause in seconds between AI-generated scenes (0–10s). Default: `2.5s` |

### Text-to-Speech (TTS)

| Setting | Description |
|---|---|
| **TTS Provider** | `Google API` (cloud) or `Local Kokoro` (self-hosted, private) |

**Google API settings:**

| Setting | Description |
|---|---|
| **Google API Key** | Your Google Cloud API key (`AIzaSy...`) |
| **Google Voice API** | Voice quality tier: `Standard`, `WaveNet`, `Neural2`, or `Journey` |
| **Voice Identifier** | Voice A–J (mix of male/female voices) |

**Kokoro settings:**

| Setting | Description |
|---|---|
| **Kokoro URL Endpoint** | URL of your Kokoro TTS server, e.g. `http://localhost:8880/v1/audio/speech` |
| **Kokoro Voice** | Choose from a dropdown of available voices. Use the **Test** button to preview the selected voice |

Available Kokoro voices:

| Voice ID | Description |
|---|---|
| `af_bella` | American Female |
| `af_sarah` | American Female |
| `af_nicole` | American Female |
| `af_sky` | American Female |
| `am_adam` | American Male |
| `am_michael` | American Male |
| `bf_emma` | British Female |
| `bf_v0isabella` | British Female |
| `bm_george` | British Male |
| `bm_lewis` | British Male |

### AI Character (AI Partner Mode)

| Setting | Description |
|---|---|
| **Character Name** | The name your AI companion uses (e.g. `Samantha`) |
| **Character Description** | Free-text personality, traits, and behaviour description |
| **System Prompt Base** | The full base system prompt. Use `[CHARACTER]` and `[NAME]` as dynamic placeholders |

### Settings Import / Export

Use the **Export** button to save your entire configuration as a `.json` file. Use **Import** to restore it on another machine or after a fresh install.

---

## Optional: Kokoro TTS Setup

Kokoro is a high-quality, fully local, open-source TTS engine. If you want completely private TTS with no API keys, you can run it in Docker alongside HandyTime.

**To enable the Kokoro container:**

1. Open your `docker-compose.yml`
2. Find the commented-out `kokoro-tts` service block
3. Uncomment it (remove the `#` from each line of the block)
4. Restart:

```bash
docker compose up -d
```

Kokoro will be available at `http://localhost:8880`. In HandyTime Settings, set:
- **TTS Provider:** `Local Kokoro`
- **Kokoro URL Endpoint:** `http://kokoro-tts:8880/v1/audio/speech` *(if using Docker networking)* or `http://localhost:8880/v1/audio/speech`

> If you already have Kokoro running elsewhere, just point HandyTime to your existing URL — no need to uncomment the service block.

---

## FAQ & Troubleshooting

**Voice commands aren't working**
> Voice recognition requires **Google Chrome** (or a Chromium browser with access to Google's speech servers) and a **secure connection** (HTTPS or localhost). Brave, Vivaldi, and similar privacy-focused browsers may block the speech API. You'll see an error message in the browser if this is the case.

**The device isn't responding**
> - Double-check your **Handy Connection Key** is correct in Settings
> - Make sure TheHandy is powered on and connected to Wi-Fi
> - Check the connection status indicator in the Handy Remote — it polls every 10 seconds

**TTS isn't working in AI Partner mode**
> - For Google TTS, verify your Google API key has the **Cloud Text-to-Speech API** enabled in the Google Cloud Console
> - For Kokoro, check that your Kokoro container or server is running and the URL is correct. Use the **Test** button in Settings to verify

**The AI isn't controlling the device**
> - Make sure your **Handy Connection Key** is entered in Settings
> - Check that your LLM API Key and URL are correctly configured
> - Some free LLM models may not reliably follow the tag format. Try a higher quality model like `mistralai/mistral-7b-instruct` or `openai/gpt-4o-mini`

**Settings aren't saved after a rebuild**
> Make sure you created the `./data` directory before starting the container (`mkdir -p data`). This directory is mounted as a volume to persist your settings.

**Changing the port**
> Edit the `PORT` value in your `.env` file, then restart: `docker compose up -d --build`
