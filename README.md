# 🎨 Doodleborne

> Draw it. Bring it to life.

Doodleborne is an interactive web app that lets you sketch anything — a car, a rocket, a fish — and then uses AI to identify what you drew and launch it into a physics-based world that matches the drawing.

## How It Works

1. **Draw** — sketch any object on the canvas (powered by Excalidraw)
2. **Identify** — click "Bring to Life" and Gemini Vision AI identifies what you drew
3. **Play** — your sketch is animated into a hand-drawn world with physics, particles, and parallax scrolling

## Worlds

| What you draw | World |
|---------------|-------|
| Car, ball, person | 🌲 Ground — rolling hills, trees, dust |
| Airplane, bird | ☁️ Sky — blue gradient, clouds, wind trails |
| Rocket, UFO | 🌌 Space — stars, planets, exhaust sparks |
| Boat | 🌊 Ocean — animated waves, splashes |
| Fish, shark | 🐟 Underwater — bubbles, seaweed, caustics |

## Controls

- **← →** — move / fly
- **↑** — jump (ground/ocean) or gain altitude (sky/space/underwater)
- **↓** — lose altitude (floating worlds)
- **Esc** — return to drawing

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Drawing | Excalidraw |
| Physics | Matter.js |
| Rendering | Canvas2D + Rough.js (hand-drawn aesthetic) |
| AI | Gemini 2.5 Flash (vision identification) |
| Backend | FastAPI (Python) |

## Running Locally

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Add your Gemini API key to `backend/.env`:
```
GEMINI_API_KEY=your_key_here
```
