// ═══════════════════════════════════════════════════
// hud.js — HUD overlay: status bar, crosshair, fire flash
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

/**
 * Draw the HUD
 */
export function drawHUD(ctx, w, h, state) {
  const barH = 44;
  ctx.save();

  // Bar background
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

  ctx.font         = '600 14px "JetBrains Mono", monospace';
  ctx.fillStyle    = '#00f0ff';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔫 HAND SHOOTER', 16, barH / 2);

  const fields = [
    { label: 'HAND',     value: state.handDetected ? 'LOCKED' : 'LOST',              color: state.handDetected ? '#39ff7f' : '#ff3d5a' },
    { label: 'THUMB',    value: state.thumbBent ? 'FIRE!' : 'READY',                 color: state.thumbBent ? '#ff3d5a' : '#00f0ff' },
    { label: 'SHOTS',    value: `${state.shots}`,                                    color: '#a78bfa' },
    { label: 'HITS',     value: `${state.hits}`,                                     color: '#ffc107' },
    { label: 'ACCURACY', value: state.shots > 0 ? `${Math.round((state.hits/state.shots)*100)}%` : '—', color: '#00f0ff' }
  ];

  let fx = w - 16;
  ctx.textAlign = 'right';

  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i];
    ctx.font      = '700 13px "JetBrains Mono", monospace';
    ctx.fillStyle = f.color;
    ctx.fillText(f.value, fx, barH / 2);
    fx -= ctx.measureText(f.value).width + 4;

    ctx.font      = '400 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(f.label + ':', fx, barH / 2);
    fx -= ctx.measureText(f.label + ':').width + 20;

    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('·', fx + 8, barH / 2);
    }
  }
  ctx.textAlign = 'left';

  // ── Thumb bend indicator ──────────────────────────
  if (state.handDetected) {
    const bbX = 16, bbY = barH + 16, bbW = 6, bbH = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.roundRect(bbX, bbY, bbW, bbH, 3); ctx.fill();

    const fillH    = bbH * state.thumbBend;
    const bendColor = state.thumbBend > 0.45 ? '#ff3d5a' : '#00f0ff';
    ctx.fillStyle = bendColor;
    ctx.beginPath(); ctx.roundRect(bbX, bbY + bbH - fillH, bbW, fillH, 3); ctx.fill();

    ctx.font      = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.save();
    ctx.translate(bbX + bbW + 4, bbY + bbH);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('THUMB BEND', 0, 0);
    ctx.restore();
  }

  // ── Crosshair ─────────────────────────────────────
  if (state.aimPoint && state.handDetected) {
    const cx   = state.aimPoint.x * w;
    const cy   = state.aimPoint.y * h;
    const size = 20;
    const isFire    = state.thumbBent;
    const isAtCam   = state.isPointingAtCamera;
    const baseColor = isFire ? '#ff3d5a' : isAtCam ? '#ffc107' : '#00f0ff';

    ctx.save();
    ctx.strokeStyle  = baseColor;
    ctx.lineWidth    = 2;
    ctx.globalAlpha  = isFire ? 1.0 : 0.88;

    // Outer ring (solid when firing, dashed when at-cam)
    if (isAtCam && !isFire) {
      ctx.setLineDash([4, 4]);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Cross hairs with gap
    const gap = 8;
    ctx.globalAlpha = isFire ? 1.0 : 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - size - 6, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);      ctx.lineTo(cx + size + 6, cy);
    ctx.moveTo(cx, cy - size - 6); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);      ctx.lineTo(cx, cy + size + 6);
    ctx.stroke();

    // At-camera stability indicator
    if (isAtCam && !isFire) {
      ctx.globalAlpha  = 0.5;
      ctx.fillStyle    = '#ffc107';
      ctx.font         = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign    = 'center';
      ctx.fillText('CAM', cx, cy + size + 16);
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
      ctx.font         = '900 48px "JetBrains Mono", monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = `rgba(255,61,90,${textAlpha * 0.8})`;
      ctx.shadowColor  = '#ff3d5a';
      ctx.shadowBlur   = 30;
      ctx.fillText('FIRE!', w/2, h*0.4);
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
    ctx.font         = '900 32px "JetBrains Mono", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = `rgba(255,193,7,${alpha})`;
    ctx.shadowColor  = '#ffc107';
    ctx.shadowBlur   = 20;
    ctx.fillText(`${comboCount}x COMBO!`, w/2, h*0.55);
    ctx.shadowBlur   = 0;
    ctx.textAlign    = 'left';
    ctx.restore();
  }

  // ── Chaos mode ─────────────────────────────────────
  if (state.chaosMode) {
    ctx.save();
    ctx.font      = '700 11px "JetBrains Mono", monospace';
    const ca      = 0.6 + Math.sin(performance.now() * 0.005) * 0.4;
    ctx.fillStyle = `rgba(255,61,90,${ca})`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡ CHAOS MODE ⚡', w/2, barH + 20);
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
  ctx.lineWidth   = 2;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur  = 6;

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

    ctx.beginPath();
    ctx.arc(px, py, isThumb ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isThumb ? '#ff3d5a' : isIndex ? '#39ff7f' : '#00f0ff';
    ctx.fill();

    if (isThumb || isIndex) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
