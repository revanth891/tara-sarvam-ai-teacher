# Tara — Multilingual 3D AI Teacher

A Sarvam Live hackathon project: speak or type in your language and learn with an animated 3D teacher and an interactive Spline companion.

## What it does

- Sarvam conversation model streams an answer as it is generated.
- Short speech segments are synthesized concurrently and played in order.
- Sarvam speech recognition detects the recorded language automatically.
- Speech drives the avatar's mouth while original idle and talking animations play.
- Choose a subject, learning level, language, and teaching style: explain simply, quiz me, or go deeper.
- Preserves the original cursor-following Spline robot, avatar selector, zoom/reset controls, text/voice modes, theme toggle, and response panel.
- Reuses the DRKZEN / Foundry visual effects.

Sarvam voice supports English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, and Odia. Lip movement is driven by audio energy; it is not phoneme-aligned speech animation.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
cp .env.example .env
# Set SARVAM_API_KEY in .env. Never prefix the key with VITE_.
npm run dev:all
```

Open http://localhost:5173. The server API runs on http://127.0.0.1:3001. On Windows, use `Copy-Item .env.example .env` instead of `cp` if needed.

You can also run `npm run dev:api` and `npm run dev` in separate terminals. Tap the microphone to record and tap again to send; recordings stop after 45 seconds. The browser will request microphone access. You can interrupt a response using Stop.

## Deploy

Import this repository into Vercel. Keep the root directory at the repository root, use the Vite preset, and add `SARVAM_API_KEY` as a server environment secret. `vercel.json` configures the build, Mumbai function region, and 60-second API execution limit. No separate Render service is required for this submission.

```sh
npm run build
npm test
```

## Architecture

`React + React Three Fiber + Spline → /api/chat → Sarvam streamed chat → concurrent Sarvam speech → ordered Web Audio playback`

`Microphone → /api/transcribe → Sarvam Saaras → detected language → chat`

The API is server-only and uses native Node HTTP/fetch APIs. It has bounded input sizes, request timeouts, cancellation, and a basic per-instance request limit. Conversation history is held in browser memory. Secrets are excluded from Git and the browser bundle.

## Project origins

Built from the author's [AvatarGPT frontend](https://github.com/revanth891/AvatarGPT_Frontend), [AvatarGPT backend](https://github.com/revanth891/AvatarGPT_Backend), and [DES646_drkzen](https://github.com/revanth891/DES646_drkzen) workflows. The original 3D models, animations, and Spline scene are retained. Foundry/DRKZEN visual effects come from the author's portfolio project.

## Verification

The streaming parser, speech ordering, input handling, language selection, and transcription upload have automated tests. Live English, Hindi, and Telugu speech and transcription roundtrips were checked during development. Typical observed first audio was around 2–5 seconds depending on language and service/network conditions; this is not a guaranteed latency.

The Spline scene loads from its original external URL. It requires internet access; text and avatar interaction remain available if that scene cannot load.
