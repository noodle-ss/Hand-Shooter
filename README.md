# 🔫 Hand Canvas Shooter

**Webcam gesture game — point your finger gun and shoot browser windows!**

A webcam-powered shooting game built entirely with vanilla JavaScript, Canvas 2D, and MediaPipe Hands. Browser windows float across the screen as targets — make a finger-gun pose and bend your thumb to shoot them!

🎮 **[Live Demo](https://noodle-ss.github.io/Hand-Shooter/)**

## Features

- **Hand Tracking & Filtering** — Real-time 21-point MediaPipe detection with Kalman-style aim smoothing and velocity damping
- **Robust Gesture Detection** — Finger-gun validation with anti-stuck release mechanisms and fire-rate limiting
- **HTML-in-Canvas** — Fake browser windows rendered via SVG `foreignObject`
- **Physics Engine** — Gravity, drag, angular momentum, hit impulse, and 2D collision
- **Dynamic Shatter** — Missed shots punch blank holes through the screen; severed fragments fall and pile up realistically
- **HUD Overlay** — Status bar, reactive crosshair, combo counter, and accuracy tracking
- **Chaos Mode** — Press `C` for maximum window spawning!

## Tech Stack

| Tech | Purpose |
|------|---------|
| MediaPipe Tasks Vision | Hand landmark detection (2D + 3D world z-depth) |
| SVG foreignObject | HTML-in-Canvas rendering |
| Canvas 2D API | Drawing / compositing |
| Advanced Filtering | Median pre-filter + velocity-based prediction for jitter-free aim |
| getUserMedia | Webcam access |
| requestAnimationFrame | 60fps game loop |

## Getting Started

### Requirements
- **Chrome** (recommended) or Edge — best MediaPipe + foreignObject support
- **Webcam** access
- **Local server** (required — won't work via `file://`)

### Quick Start

```bash
# Option 1: Python
python -m http.server 8080

# Option 2: Node.js
npx -y serve .

# Option 3: VS Code Live Server extension
```

Then open `http://localhost:8080` in Chrome.

## Controls

| Key | Action |
|-----|--------|
| ✋ Hand | Show your hand to lock tracking |
| 👆 Point | Aim with index finger (finger-gun pose) |
| 👍 Thumb bend | Bend thumb inward to fire |
| `S` | Toggle hand skeleton overlay |
| `C` | Toggle **chaos mode** (20 windows!) |

## File Structure

```
Hand-Shooter/
├── src/
│   ├── main.js            # Entry — init camera + RAF loop + FPS monitor
│   ├── hand-tracker.js    # MediaPipe setup + landmark parsing
│   ├── gesture.js         # Aim filtering + robust finger-gun + fire cooldown
│   ├── renderer.js        # Canvas draw loop + cached vignette
│   ├── window-spawner.js  # HTML-in-canvas element factory
│   ├── physics.js         # Velocity, gravity, collision
│   ├── shatter.js         # Glass fracture, screen holes + fragment piling
│   └── hud.js             # Status bar, crosshair, effects
├── assets/
│   └── style.css          # Reset + canvas full-screen
├── index.html             # Single page — canvas fills viewport
└── README.md
```

## Notes

- ⚠️ **CORS**: Must use a local server, not `file://`
- ⚡ **Performance**: Window images are cached; FPS auto-adapts on slower devices
- ◎ **Lighting**: Good lighting improves hand detection accuracy
- ✓ **Browser**: Chrome works best; Firefox has foreignObject gaps
- 🎯 **Pose**: Make a finger-gun pose (index out, others curled) to fire

## License

MIT
