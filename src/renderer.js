// ═══════════════════════════════════════════════════
// renderer.js — Canvas draw loop + compositing
// Uses logical pixel coords (DPR handled in main.js via ctx.setTransform)
// Optimized: cached vignette, pre-allocated mirrored array, fewer save/restore
// ═══════════════════════════════════════════════════

import { getParticles } from './physics.js';
import { processPendingShatters, drawShatter } from './shatter.js';
import { drawHUD, drawHandSkeleton } from './hud.js';
import { HAND_CONNECTIONS } from './hand-tracker.js';

// ── Cached vignette ──────────────────────────────────
let vignetteCanvas  = null;
let vignetteW       = 0;
let vignetteH       = 0;

function getVignette(w, h) {
  if (vignetteCanvas && vignetteW === w && vignetteH === h) {
    return vignetteCanvas;
  }
  vignetteCanvas       = document.createElement('canvas');
  vignetteCanvas.width  = w;
  vignetteCanvas.height = h;
  vignetteW = w;
  vignetteH = h;

  const vCtx = vignetteCanvas.getContext('2d');
  // Use max dimension so vignette covers all edges (fix ultrawide bug)
  const outerR = Math.sqrt(w * w + h * h) * 0.55;
  const vg = vCtx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, outerR);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  vCtx.fillStyle = vg;
  vCtx.fillRect(0, 0, w, h);

  return vignetteCanvas;
}

// ── Pre-allocated mirrored landmarks array ──────────
const mirroredLandmarks = new Array(21);
for (let i = 0; i < 21; i++) mirroredLandmarks[i] = { x: 0, y: 0, z: 0 };

export function render(ctx, canvas, video, gameState) {
  // Always use logical (CSS) dimensions for drawing
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.clearRect(0, 0, w, h);

  // 1. Mirrored webcam feed — fills logical canvas
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  // Slight darken for contrast
  ctx.fillStyle = 'rgba(0,0,10,0.2)';
  ctx.fillRect(0, 0, w, h);

  // 2. Floating windows — batch with minimal save/restore
  for (const win of gameState.windows) {
    if (!win.image || win.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = win.opacity;
    ctx.translate(win.x, win.y);
    ctx.rotate(win.rotation);
    ctx.scale(win.scale, win.scale);
    ctx.drawImage(win.image, -win.width / 2, -win.height / 2, win.width, win.height);

    ctx.strokeStyle = win.alive
      ? `rgba(99,102,241,${0.3 + win.glowIntensity * 0.3})`
      : 'rgba(255,61,90,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-win.width / 2, -win.height / 2, win.width, win.height);
    ctx.restore();
  }

  // 3. Particles — skip very faded ones, batch style
  const particles = getParticles();
  if (particles.length > 0) {
    ctx.save();
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      if (alpha < 0.05) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;

      // Inline transform instead of save/restore per particle
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.size > 6) {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Reset transform back to dpr-scaled
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.restore();
  }

  // 4. Shatter — snapshot taken here at logical size, fragments drawn
  processPendingShatters(canvas, w, h);
  drawShatter(ctx, w, h);

  // 5. Hand skeleton — reuse pre-allocated mirrored array
  if (gameState.showSkeleton && gameState.landmarks) {
    const lm = gameState.landmarks;
    for (let i = 0; i < 21; i++) {
      mirroredLandmarks[i].x = 1 - lm[i].x;
      mirroredLandmarks[i].y = lm[i].y;
      mirroredLandmarks[i].z = lm[i].z;
    }
    drawHandSkeleton(ctx, mirroredLandmarks, HAND_CONNECTIONS, w, h);
  }

  // 6. HUD
  drawHUD(ctx, w, h, {
    handDetected:       gameState.handDetected,
    thumbBent:          gameState.thumbBent,
    shots:              gameState.shots,
    hits:               gameState.hits,
    thumbBend:          gameState.thumbBend,
    aimPoint:           gameState.mirroredAimPoint,
    isPointingAtCamera: gameState.isPointingAtCamera,
    chaosMode:          gameState.chaosMode
  });

  // 7. Vignette — cached offscreen canvas (no gradient re-creation per frame)
  const vignette = getVignette(w, h);
  ctx.drawImage(vignette, 0, 0);
}
