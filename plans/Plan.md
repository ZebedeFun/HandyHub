# Role and Goal
You are a senior full-stack developer. Your task is to build a web-based "AI Girlfriend Experience" chat application that natively syncs with "TheHandy" interactive hardware. 

The application will use an uncensored LLM via the Nano-GPT (or OpenRouter) API for chat, parse specific hidden tokens from the AI's response stream to control TheHandy device in real-time, and feature natural Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities using Google APIs. The entire stack will run containerized on an Ampere-based Oracle server.

# Tech Stack
*   **Frontend:** Vite + React + Tailwind CSS
*   **Backend Proxy:** Node.js + Express (to securely hold API keys and handle external requests without CORS issues)
*   **Icons:** Lucide React
*   **Voice Processing:** Google Cloud Speech-to-Text and Text-to-Speech APIs
*   **Deployment:** Docker (optimized for linux/arm64 architecture on Oracle Ampere)

# Core Architecture & Features
1.  **The Chat UI:** A clean, mobile-responsive chat interface looking like text messages back and forth. It must support real-time message streaming, microphone input, audio playback controls, and an "auto mode" toggle to keep the conversation going automatically every few seconds.
2.  **The LLM Connector:** A backend endpoint that connects to the Nano-GPT API. It should send the conversation history and a dynamically generated System Prompt based on a user-defined character.
3.  **The Interceptor (Token Parser):** The AI model will be instructed to output commands in the format `[HANDY_SPEED:XX]` or `[HANDY_STROKE:XX]`. The frontend must intercept the text stream, strip these bracketed commands out so the user never sees them, and trigger the corresponding hardware API calls.
4.  **The Handy API Wrapper:** A utility file that handles authentication and sends HTTP PUT/POST requests to TheHandy API v3.
5.  **Voice Controller:** Integrates Google Speech-to-Text for capturing natural user audio and Text-to-Speech for vocalizing the AI's response (with command tokens stripped).
6.  **Configuration Manager:** A comprehensive settings screen allowing the user to configure all relevant settings (API keys, character persona, global system prompt, TTS voices, etc.).

# Step-by-Step Implementation Plan

## Step 1: Initialization & UI Shell
*   Initialize a Vite React project and a basic Express server.
*   Build the main Chat UI components: a message list, an input area (with a push-to-talk microphone button), and a comprehensive "Settings" configuration screen.
*   The configuration screen must include fields for: Handy Connection Key, Google API Credentials, LLM API Key, an optional "Character Description" (defaults to "an intimate girlfriend"), and an editable "System Prompt" field.
*   Create a visually distinct "Device Status" indicator (Disconnected, Connecting, Connected) in the header.

## Step 2: TheHandy Integration
*   Create a `handyService.js` file.
*   Implement functions to connect to TheHandy API using the user's Connection Key.
*   Create two core functions: `setSpeed(speedPercentage)` and `setStrokeLength(strokePercentage)`. Both should map to the official Handy API v3 endpoints for HAMP (Hardware Asynchronous Motor Protocol) state changes.

## Step 3: The Proxy Backend
*   Set up an Express route `/api/chat` that accepts the message history.
*   Implement the API call to Nano-GPT (format it exactly like an OpenAI ChatCompletions request, but pointing to the Nano-GPT base URL).
*   Add Express routes to process incoming audio blobs via Google STT, and route text streams to Google TTS to return playable audio.
*   Stream the response back to the frontend.

## Step 4: The Stream Parser (Crucial)
*   On the frontend, as the chunks stream in from the backend, use a Regex parser to look for `[HANDY_SPEED:number]` and `[HANDY_STROKE:number]`.
*   When a token is fully buffered:
    1. Extract the number.
    2. Fire the corresponding function in `handyService.js`.
    3. Delete the token from the UI text stream so it remains invisible to the user.

## Step 5: The AI System Prompt
*   Inject this system prompt into the LLM context array, dynamically inserting the configured character description (allow the user to edit this baseline in settings):
    "You are [CHARACTER_DESCRIPTION_DEFAULTING_TO: an intimate girlfriend]. You must maintain character at all times. 
    Keep your responses short, ideally 1 or 2 paragraphs at a time.
    You have physical connection to the user via a tactile device. You control the device using hidden text commands. 
    Whenever the emotional or physical intensity of the conversation shifts, you MUST append a command to your response. 
    Use the format `[HANDY_SPEED:X]` where X is 0 to 100.
    Use the format `[HANDY_STROKE:X]` where X is 0 to 100.
    Example: 'I've missed you so much today... [HANDY_SPEED:40]'
    Never acknowledge the commands in your spoken text. Just use them naturally to match the mood."

## Step 6: Containerization (Oracle Ampere)
*   Create a `Dockerfile` for the combined frontend/backend application.
*   Use `linux/arm64` base images (like `node:20-alpine`) to ensure compatibility with Oracle Ampere instances.
*   Set up a `docker-compose.yml` to orchestrate building and running the app seamlessly.

# Execution Rules
*   Do not stub out logic. Write the complete, functional code for the token parser and stream handling, as that is the hardest part.
*   Ensure the regex for parsing tokens can handle chunks arriving in fragments (e.g., if `[HANDY_SP` arrives in one chunk and `EED:50]` in the next).
*   Begin by setting up the project structure and let me know when you are ready to write the UI code.