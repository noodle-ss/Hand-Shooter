// ═══════════════════════════════════════════════════
// hud.js — HUD overlay: status bar, crosshair, fire flash
// Mobile-friendly: all sizes scale with canvas width
// ═══════════════════════════════════════════════════

let fireFlashTimer = 0;
let comboCount     = 0;
let comboTimer     = 0;
let lastHitTime    = 0;

export function triggerFireFlash() {
  fireFlashTimer = 25;
}

export function registerHit() {
  const now = performance.now();
  if (now - lastHitTime < 2000) { comboCount++; } else { comboCount = 1; }
  lastHitTime = now;
  comboTimer  = 90;
}

// ── Responsive scale helper ───────────────────────
// Returns a pixel value that scales with the canvas logical width.
// Base reference: 390px wide (iPhone 14). Values are identical to the
// original at 390px and grow/shrink proportionally on other screens.
function s(base, w, minVal = base * 0.6) {
  return Math.max(minVal, (base / 390) * w);
}

// Safe area bottom offset so the thumb-bend bar doesn't hide under the home bar
function getSafeBottom() {
  const el = document.documentElement;
  const raw = getComputedStyle(el).getPropertyValue('--sab') || '0px';
  return parseInt(raw, 10) || 0;
}

/**
 * Draw the HUD
 */
export function drawHUD(ctx, w, h, state) {
  // Responsive bar height
  const barH  = Math.round(s(44, w, 32));
  const fMono = `'JetBrains Mono', monospace`;

  ctx.save();

  // ── Status bar background ─────────────────────────
  const barGrad = ctx.createLinearGradient(0, 0, w, 0);
  barGrad.addColorStop(0,   'rgba(10,10,20,0.88)');
  barGrad.addColorStop(0.5, 'rgba(15,15,32,0.92)');
  barGrad.addColorStop(1,   'rgba(10,10,20,0.88)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, w, barH);

  const borderGrad = ctx.createLinearGradient(0, barH, w, barH);
  borderGrad.addColorStop(0,   'rgba(0,240,255,0)');
  borderGrad.addColorStop(0.3, 'rgba(0,240,255,0.4)');
  borderGrad.addColorStop(0.7, 'rgba(167,139,250,0.4)');
  borderGrad.addColorStop(1,   'rgba(255,61,90,0)');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, barH - 1.5, w, 1.5);

  // ── Title (only show on wider screens) ───────────
  if (w > 340) {
    ctx.font         = `600 ${s(13, w, 10)}px ${fMono}`;
    ctx.fillStyle    = '#00f0ff';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔫 HAND SHOOTER', s(12, w, 8), barH / 2);
  }

  // ── Stats fields — compact on narrow screens ──────
  const fields = [
    { label: 'HAND',  value: state.handDetected ? 'LOCK' : 'LOST',
      color: state.handDetected ? '#39ff7f' : '#ff3d5a' },
    { label: 'SHOTS', value: `${state.shots}`, color: '#a78bfa' },
    { label: 'HITS',  value: `${state.hits}`,  color: '#ffc107' },
    { label: 'ACC',   value: state.shots > 0 ? `${Math.round((state.hits / state.shots) * 100)}%` : '—',
      color: '#00f0ff' }
  ];

  let fx = w - s(12, w, 6);
  ctx.textAlign = 'right';

  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i];
    ctx.font      = `700 ${s(12, w, 9)}px ${fMono}`;
    ctx.fillStyle = f.color;
    ctx.fillText(f.value, fx, barH / 2);
    fx -= ctx.measureText(f.value).width + 3;

    ctx.font      = `400 ${s(9, w, 7)}px ${fMono}`;
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillText(f.label + ':', fx, barH / 2);
    fx -= ctx.measureText(f.label + ':').width + s(14, w, 8);

    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('·', fx + s(6, w, 4), barH / 2);
    }
  }
  ctx.textAlign = 'left';

  // ── Thumb bend indicator ──────────────────────────
  if (state.handDetected) {
    const safeBottom = getSafeBottom();
    const bbW  = s(6, w, 5);
    const bbH  = Math.min(s(120, w, 70), h * 0.28);
    const bbX  = s(14, w, 10);
    const bbY  = h - safeBottom - bbH - s(20, w, 14);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.roundRect(bbX, bbY, bbW, bbH, 3); ctx.fill();

    const fillH     = bbH * state.thumbBend;
    const bendColor = state.thumbBend > 0.45 ? '#ff3d5a' : '#00f0ff';
    ctx.fillStyle = bendColor;
    ctx.beginPath(); ctx.roundRect(bbX, bbY + bbH - fillH, bbW, fillH, 3); ctx.fill();

    // Label (only on wide enough screens)
    if (w > 320) {
      ctx.font      = `600 ${s(8, w, 6)}px ${fMono}`;
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.save();
      ctx.translate(bbX + bbW + 3, bbY + bbH);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('THUMB', 0, 0);
      ctx.restore();
    }
  }

  // ── Crosshair ─────────────────────────────────────
  if (state.aimPoint && state.handDetected) {
    const cx   = state.aimPoint.x * w;
    const cy   = state.aimPoint.y * h;
    const size = s(20, w, 14);

    const isFire  = state.thumbBent;
    const isAtCam = state.isPointingAtCamera;
    const color   = isFire ? '#ff3d5a' : isAtCam ? '#ffc107' : '#00f0ff';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = s(2, w, 1.5);
    ctx.globalAlpha = isFire ? 1.0 : 0.88;

    if (isAtCam && !isFire) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(cx, cy, s(2.5, w, 1.5), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const gap = s(8, w, 5);
    ctx.globalAlpha = isFire ? 1.0 : 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - size - s(6, w), cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);            ctx.lineTo(cx + size + s(6, w), cy);
    ctx.moveTo(cx, cy - size - s(6, w)); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);            ctx.lineTo(cx, cy + size + s(6, w));
    ctx.stroke();

    if (isAtCam && !isFire) {
      ctx.globalAlpha  = 0.5;
      ctx.fillStyle    = '#ffc107';
      ctx.font         = `600 ${s(9, w, 7)}px ${fMono}`;
      ctx.textAlign    = 'center';
      ctx.fillText('CAM', cx, cy + size + s(14, w, 10));
      ctx.textAlign    = 'left';
    }

    ctx.restore();
  }

  // ── Fire flash ─────────────────────────────────────
  if (fireFlashTimer > 0) {
    fireFlashTimer--;
    const alpha = fireFlashTimer / 25;
    ctx.save();
    const flashGrad = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.8);
    flashGrad.addColorStop(0, 'rgba(255,61,90,0)');
    flashGrad.addColorStop(1, `rgba(255,61,90,${alpha * 0.2})`);
    ctx.fillStyle = flashGrad;
    ctx.fillRect(0, 0, w, h);

    if (fireFlashTimer > 10) {
      const textAlpha = (fireFlashTimer - 10) / 15;
      ctx.font         = `900 ${s(42, w, 26)}px ${fMono}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = `rgba(255,61,90,${textAlpha * 0.8})`;
      ctx.shadowColor  = '#ff3d5a';
      ctx.shadowBlur   = s(28, w, 14);
      ctx.fillText('FIRE!', w/2, h * 0.4);
      ctx.shadowBlur   = 0;
      ctx.textAlign    = 'left';
    }
    ctx.restore();
  }

  // ── Combo counter ──────────────────────────────────
  if (comboTimer > 0 && comboCount > 1) {
    comboTimer--;
    const alpha = Math.min(1, comboTimer / 30);
    ctx.save();
    ctx.font         = `900 ${s(28, w, 18)}px ${fMono}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = `rgba(255,193,7,${alpha})`;
    ctx.shadowColor  = '#ffc107';
    ctx.shadowBlur   = s(18, w, 10);
    ctx.fillText(`${comboCount}x COMBO!`, w/2, h * 0.55);
    ctx.shadowBlur   = 0;
    ctx.textAlign    = 'left';
    ctx.restore();
  }

  // ── Chaos mode indicator ───────────────────────────
  if (state.chaosMode) {
    ctx.save();
    ctx.font      = `700 ${s(10, w, 8)}px ${fMono}`;
    const ca      = 0.6 + Math.sin(performance.now() * 0.005) * 0.4;
    ctx.fillStyle = `rgba(255,61,90,${ca})`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡ CHAOS MODE ⚡', w/2, barH + s(18, w, 13));
    ctx.textAlign = 'left';
    ctx.restore();
  }

  ctx.restore();
}

export function drawHandSkeleton(ctx, landmarks, connections, w, h) {
  if (!landmarks) return;
  ctx.save();
  ctx.globalAlpha = 0.55;

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth   = s(2, w, 1.2);
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur  = s(6, w, 3);

  for (const [a, b] of connections) {
    const la = landmarks[a], lb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  for (let i = 0; i < landmarks.length; i++) {
    const l  = landmarks[i];
    const px = l.x * w, py = l.y * h;
    const isThumb = i >= 1 && i <= 4;
    const isIndex = i >= 5 && i <= 8;
    const r = isThumb ? s(5, w, 3.5) : s(3.5, w, 2.5);

    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = isThumb ? '#ff3d5a' : isIndex ? '#39ff7f' : '#00f0ff';
    ctx.fill();

    if (isThumb || isIndex) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth   = s(1, w, 0.8);
      ctx.beginPath();
      ctx.arc(px, py, s(8, w, 5), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
