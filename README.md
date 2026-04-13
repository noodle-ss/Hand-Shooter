# 🔫 Hand Shooter

**Webcam gesture game — point your finger gun and shoot browser windows!**

A webcam-powered shooting game built entirely with vanilla JavaScript, Canvas 2D, and MediaPipe Hands. Browser windows float across the screen as targets — make a finger-gun pose and bend your thumb to shoot them!

🎮 **[Live Demo](https://YOUR_USERNAME.github.io/Hand-Shooter/)** ← *update with your GitHub username*

## Features

- **Hand Tracking** — Real-time 21-point hand landmark detection via MediaPipe
- **Finger-Gun Detection** — Validates gun pose (index extended, others curled) before firing
- **One-Euro Filter** — Buttery-smooth, jitter-free crosshair with zero-latency fast moves
- **3D Pointing** — Uses world landmarks to detect when you're pointing at the camera
- **HTML-in-Canvas** — Fake browser windows rendered via SVG `foreignObject`
- **Physics Engine** — Gravity, drag, angular momentum, hit impulse
- **Glass Shatter** — Missed shots shatter the screen; fragments pile up at the bottom
- **HUD Overlay** — Status bar, crosshair, combo counter, accuracy tracking
- **Chaos Mode** — Press `C` for maximum window spawning!

## Tech Stack

| Tech | Purpose |
|------|---------|
| MediaPipe Tasks Vision | Hand landmark detection (2D + 3D world) |
| SVG foreignObject | HTML-in-Canvas rendering |
| Canvas 2D API | Drawing / compositing |
| One-Euro Filter | Jitter-free aim smoothing |
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

## GitHub Pages Deployment

This project works **directly on GitHub Pages** — no build step needed!

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/Hand-Shooter.git
git push -u origin main

# 2. Enable Pages
# Go to Settings → Pages → Source: Deploy from branch → main → / (root)
# Your site will be live at https://YOUR_USERNAME.github.io/Hand-Shooter/
```

> **Note**: GitHub Pages serves over HTTPS, which is required for `getUserMedia` (webcam access). It works out of the box!

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
│   ├── gesture.js         # One-Euro filter aim + finger-gun detection
│   ├── renderer.js        # Canvas draw loop + cached vignette
│   ├── window-spawner.js  # HTML-in-canvas element factory
│   ├── physics.js         # Velocity, gravity, collision
│   ├── shatter.js         # Glass fracture + fragment piling
│   └── hud.js             # Status bar, crosshair, effects
├── assets/
│   └── style.css          # Reset + canvas full-screen
├── index.html             # Single page — canvas fills viewport
├── 404.html               # GitHub Pages fallback
└── README.md
```

## Notes

- ⚠️ **CORS**: Must use a local server or GitHub Pages, not `file://`
- ⚡ **Performance**: Window images are cached; FPS auto-adapts on slower devices
- ◎ **Lighting**: Good lighting improves hand detection accuracy
- ✓ **Browser**: Chrome works best; Firefox has foreignObject gaps
- 🎯 **Pose**: Make a finger-gun pose (index out, others curled) to fire

## License

MIT
