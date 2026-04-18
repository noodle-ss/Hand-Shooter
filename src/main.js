// ═══════════════════════════════════════════════════
// main.js — Entry point: init camera + RAF game loop
// Mobile-friendly: fullscreen API, touch controls,
// orientation handling, mobile camera constraints
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
const fullscreenBtn  = document.getElementById('fullscreen-btn');
const fsIconExpand   = document.getElementById('fs-icon-expand');
const fsIconCompress = document.getElementById('fs-icon-compress');
const touchControls  = document.getElementById('touch-controls');
const chaosBtn       = document.getElementById('chaos-btn');
const skeletonBtn    = document.getElementById('skeleton-btn');

// ── Device detection ─────────────────────────────────
const isTouchDevice = () => navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

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

// ── Canvas resize ────────────────────────────────────
// Uses dvh (dynamic viewport height) units to handle address bar collapse on mobile
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x to save memory on HiDPI mobile
  const w   = window.innerWidth;
  const h   = window.innerHeight;

  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
// Also fire on orientation change (mobile) — add small delay for browser to settle
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
resizeCanvas();

// ── Fullscreen API ───────────────────────────────────
// Works cross-browser including iOS Safari (which uses a different API)

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement
  );
}

async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen)              await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen)   await el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)      await el.mozRequestFullScreen();
  } catch (e) {
    // iOS Safari doesn't support fullscreen API — gracefully ignore
    console.warn('Fullscreen not available:', e.message);
  }
}

async function exitFullscreen() {
  try {
    if (document.exitFullscreen)              await document.exitFullscreen();
    else if (document.webkitExitFullscreen)   await document.webkitExitFullscreen();
    else if (document.mozCancelFullScreen)    await document.mozCancelFullScreen();
  } catch (e) {
    console.warn('Exit fullscreen failed:', e.message);
  }
}

function updateFullscreenIcon() {
  const full = isFullscreen();
  fsIconExpand.style.display   = full ? 'none'  : 'block';
  fsIconCompress.style.display = full ? 'block' : 'none';
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(evt =>
  document.addEventListener(evt, updateFullscreenIcon)
);

fullscreenBtn.addEventListener('click', () => {
  isFullscreen() ? exitFullscreen() : enterFullscreen();
});

// ── Orientation lock (where supported) ──────────────
// Tries to lock to portrait on mobile; silently ignores on desktop/unsupported
async function tryLockOrientation() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('portrait');
    }
  } catch (e) {
    // Not supported or not allowed — no problem, game still works landscape
  }
}

// ── Camera ───────────────────────────────────────────
async function initCamera() {
  loadingStatus.textContent = 'Requesting camera access…';
  try {
    // On mobile, use lower resolution for performance; desktop gets 1080p
    const isMobile = isTouchDevice();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',                       // front/selfie camera
        width:  { ideal: isMobile ? 640 : 1280 },
        height: { ideal: isMobile ? 480 : 720 },
        frameRate: { ideal: 30, max: 30 }
      },
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

// ── Keyboard shortcuts (desktop) ─────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 's' || e.key === 'S') toggleSkeleton();
  if (e.key === 'c' || e.key === 'C') toggleChaos();
  if (e.key === 'f' || e.key === 'F') isFullscreen() ? exitFullscreen() : enterFullscreen();
});

// ── Touch controls (mobile in-game) ──────────────────
function toggleChaos() {
  gameState.chaosMode = !gameState.chaosMode;
  if (gameState.chaosMode) { gameState.maxWindows = 20; gameState.spawnInterval = 30; }
  else                     { gameState.maxWindows = 8;  gameState.spawnInterval = 120; }
  chaosBtn.classList.toggle('active', gameState.chaosMode);
}

function toggleSkeleton() {
  gameState.showSkeleton = !gameState.showSkeleton;
  skeletonBtn.classList.toggle('active', gameState.showSkeleton);
}

chaosBtn.addEventListener('click', toggleChaos);
skeletonBtn.addEventListener('click', toggleSkeleton);

// ── Window management ────────────────────────────────
function manageWindows() {
  gameState.spawnTimer++;

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

    if (!hitAny) {
      queueShatter(mirroredAim.x * lw, mirroredAim.y * lh);
    }
  }

  for (const win of gameState.windows) updateWindowPhysics(win, lw, lh);
  updateParticles();
  updateShatter(lw, lh);
  manageWindows();

  render(ctx, canvas, video, gameState);
  requestAnimationFrame(gameLoop);
}

// ── Start ────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  startScreen.style.display = 'none';

  // Show in-game UI
  fullscreenBtn.style.display = 'flex';
  if (isTouchDevice()) {
    touchControls.style.display = 'flex';
    skeletonBtn.classList.add('active');  // skeleton on by default
  }

  // Try to lock portrait on mobile
  await tryLockOrientation();

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
