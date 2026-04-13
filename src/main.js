// ═══════════════════════════════════════════════════
// main.js — Entry point: init camera + RAF game loop
// ═══════════════════════════════════════════════════

import { initHandTracker, detectHand } from './hand-tracker.js';
import { processGesture, GESTURE, resetGesture } from './gesture.js';
import { spawnWindow } from './window-spawner.js';
import {
  updateWindowPhysics,
  isOffScreen,
  hitTestPoint,
  applyHit,
  updateParticles,
  clearParticles
} from './physics.js';
import { queueShatter, updateShatter, clearShatter } from './shatter.js';
import { render } from './renderer.js';
import { triggerFireFlash, registerHit } from './hud.js';

// ── DOM ─────────────────────────────────────────────
const canvas         = document.getElementById('game-canvas');
const ctx            = canvas.getContext('2d');
const video          = document.getElementById('webcam');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus  = document.getElementById('loading-status');
const startScreen    = document.getElementById('start-screen');
const startBtn       = document.getElementById('start-btn');

// ── Game state ───────────────────────────────────────
const gameState = {
  running:            false,
  windows:            [],
  shots:              0,
  hits:               0,
  handDetected:       false,
  thumbBent:          false,
  thumbBend:          0,
  landmarks:          null,
  aimPoint:           null,
  mirroredAimPoint:   null,
  isPointingAtCamera: false,
  showSkeleton:       true,
  chaosMode:          false,
  maxWindows:         8,
  spawnInterval:      120,
  spawnTimer:         0
};

// ── Canvas resize — honours devicePixelRatio for crisp rendering ──────
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;

  // Physical pixels
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  // CSS size stays at logical pixels
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';

  // Scale context so all drawing uses logical pixel coords
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Camera ───────────────────────────────────────────
async function initCamera() {
  loadingStatus.textContent = 'Requesting camera access…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => { video.play(); resolve(); };
    });
    loadingStatus.textContent = 'Camera ready ✓';
    return true;
  } catch (err) {
    loadingStatus.textContent = `Camera error: ${err.message}`;
    return false;
  }
}

// ── Keyboard shortcuts ───────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 's' || e.key === 'S') gameState.showSkeleton = !gameState.showSkeleton;
  if (e.key === 'c' || e.key === 'C') {
    gameState.chaosMode = !gameState.chaosMode;
    if (gameState.chaosMode) { gameState.maxWindows = 20; gameState.spawnInterval = 30; }
    else                     { gameState.maxWindows = 8;  gameState.spawnInterval = 120; }
  }
});

// ── Window management ────────────────────────────────
function manageWindows() {
  gameState.spawnTimer++;

  // Logical canvas size for bounds checks
  const lw = window.innerWidth;
  const lh = window.innerHeight;

  gameState.windows = gameState.windows.filter(win => {
    if (!win.alive && win.opacity <= 0) return false;
    if (isOffScreen(win, lw, lh)) return false;
    return true;
  });

  const aliveCount = gameState.windows.filter(w => w.alive).length;
  if (aliveCount < gameState.maxWindows && gameState.spawnTimer >= gameState.spawnInterval) {
    gameState.windows.push(spawnWindow(lw, lh));
    gameState.spawnTimer = 0;
  }

  if (gameState.windows.length === 0) {
    for (let i = 0; i < 5; i++) {
      const win = spawnWindow(lw, lh);
      win.x  = lw * 0.2 + Math.random() * lw * 0.6;
      win.y  = lh * 0.15 + Math.random() * lh * 0.5;
      win.vx = (Math.random() - 0.5) * 1;
      win.vy = (Math.random() - 0.5) * 0.5;
      gameState.windows.push(win);
    }
  }
}

// ── Game loop ────────────────────────────────────────
function gameLoop() {
  if (!gameState.running) return;

  const lw = window.innerWidth;
  const lh = window.innerHeight;

  const handResult = detectHand(video);
  const gesture    = processGesture(handResult.detected, handResult.landmarks);

  gameState.handDetected       = gesture.handDetected;
  gameState.thumbBent          = gesture.thumbBent;
  gameState.thumbBend          = gesture.thumbBendAmount;
  gameState.landmarks          = handResult.landmarks;
  gameState.aimPoint           = gesture.aimPoint;
  gameState.isPointingAtCamera = gesture.isPointingAtCamera || false;

  if (gesture.aimPoint) {
    gameState.mirroredAimPoint = { x: 1 - gesture.aimPoint.x, y: gesture.aimPoint.y };
  } else {
    gameState.mirroredAimPoint = null;
  }

  // Fire
  if (gesture.event === GESTURE.THUMB_FIRE && gesture.aimPoint) {
    gameState.shots++;
    triggerFireFlash();

    const mirroredAim = { x: 1 - gesture.aimPoint.x, y: gesture.aimPoint.y };
    let hitAny = false;

    for (const win of gameState.windows) {
      if (hitTestPoint(mirroredAim, win, lw, lh)) {
        applyHit(win, lw, lh);
        gameState.hits++;
        registerHit();
        hitAny = true;
        break;
      }
    }

    // Miss — shatter the screen at the aim point
    if (!hitAny) {
      queueShatter(mirroredAim.x * lw, mirroredAim.y * lh);
    }
  }

  // Physics — use logical dimensions
  for (const win of gameState.windows) updateWindowPhysics(win, lw, lh);
  updateParticles();
  updateShatter(lw, lh);
  manageWindows();

  render(ctx, canvas, video, gameState);
  requestAnimationFrame(gameLoop);
}

// ── Start ────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startScreen.style.display = 'none';
  gameState.running    = true;
  gameState.windows    = [];
  gameState.shots      = 0;
  gameState.hits       = 0;
  gameState.spawnTimer = 0;
  resetGesture();
  clearParticles();
  clearShatter();
  requestAnimationFrame(gameLoop);
});

// ── Boot ─────────────────────────────────────────────
async function boot() {
  const cameraOk = await initCamera();
  if (!cameraOk) return;
  await initHandTracker(status => { loadingStatus.textContent = status; });
  loadingOverlay.style.display = 'none';
  startScreen.style.display    = 'flex';
}

boot();
