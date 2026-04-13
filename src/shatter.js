// ═══════════════════════════════════════════════════
// shatter.js — Realistic glass fracture system
// Impact point goes WHITE (blank hole), fragments carry
// the torn-away screen content, fall and pile at bottom.
// Optimized: cropped snapshots so fragments can pile up.
// ═══════════════════════════════════════════════════

const FRAG_GRAVITY    = 0.20;
const MAX_FRAGMENTS   = 200;       // Raised — user wants piling up
const BURST_FRAMES    = 5;
const REST_JITTER     = 0.18;
const FADE_DELAY      = 600;       // ~10s resting before fade (longer pile)
const FADE_RATE       = 0.002;     // slower fade so piles stay visible
const BOTTOM_MARGIN   = 6;
const CRACK_LIFETIME  = 40;
const MAX_CRACK_DEPTH = 3;

let pendingShatters = [];
let fragments       = [];
let crackNetworks   = [];

// Persistent "holes" burned into the screen (white areas that linger)
let screenHoles     = [];

// Reusable snapshot canvas — avoids creating new canvases each shatter
let _snapCanvas = null;
let _snapCtx    = null;

function getSnapshotCanvas(w, h) {
  if (!_snapCanvas) {
    _snapCanvas = document.createElement('canvas');
    _snapCtx    = _snapCanvas.getContext('2d');
  }
  // Only resize if needed
  if (_snapCanvas.width !== w || _snapCanvas.height !== h) {
    _snapCanvas.width  = w;
    _snapCanvas.height = h;
  }
  return { canvas: _snapCanvas, ctx: _snapCtx };
}

// ── Voronoi-style polygon generation ─────────────────────────────────

function generateFragmentPolygons(cx, cy, radius, count) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * (Math.PI / count) * 1.4;
    const r     = radius * (0.25 + Math.random() * 0.75);
    seeds.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, angle });
  }

  const polys = [];
  for (let i = 0; i < seeds.length; i++) {
    const prev = seeds[(i - 1 + seeds.length) % seeds.length];
    const curr = seeds[i];
    const next = seeds[(i + 1) % seeds.length];

    const outerR1   = radius * (0.85 + Math.random() * 0.4);
    const outerR2   = radius * (0.85 + Math.random() * 0.4);
    const midAngle1 = (prev.angle + curr.angle) / 2 + (Math.random() - 0.5) * 0.15;
    const midAngle2 = (curr.angle + next.angle) / 2 + (Math.random() - 0.5) * 0.15;

    const verts = [
      { x: cx, y: cy },
      { x: cx + Math.cos(midAngle1) * outerR1, y: cy + Math.sin(midAngle1) * outerR1 },
      { x: curr.x, y: curr.y },
      { x: cx + Math.cos(midAngle2) * outerR2, y: cy + Math.sin(midAngle2) * outerR2 }
    ];

    if (Math.random() > 0.4) {
      const extraAngle = (midAngle2 + curr.angle) / 2;
      const extraR     = radius * (0.5 + Math.random() * 0.35);
      verts.splice(3, 0, {
        x: cx + Math.cos(extraAngle) * extraR,
        y: cy + Math.sin(extraAngle) * extraR
      });
    }
    polys.push(verts);
  }
  return polys;
}

// ── Fragment spawning ─────────────────────────────────────────────────

function spawnFragments(cx, cy, croppedSnapshot, cropOffsetX, cropOffsetY, canvasH) {
  const count  = 8 + Math.floor(Math.random() * 5);
  const radius = 80 + Math.random() * 55;
  const polys  = generateFragmentPolygons(cx, cy, radius, count);

  for (const verts of polys) {
    let sumX = 0, sumY = 0;
    for (const v of verts) { sumX += v.x; sumY += v.y; }
    const centX = sumX / verts.length;
    const centY = sumY / verts.length;

    const relVerts = verts.map(v => ({ x: v.x - centX, y: v.y - centY }));

    const dx    = centX - cx || (Math.random() - 0.5) * 2;
    const dy    = centY - cy || (Math.random() - 0.5) * 2;
    const dist  = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 3 + Math.random() * 6;

    fragments.push({
      originX:       centX,
      originY:       centY,
      x:             centX,
      y:             centY,
      vx:            (dx / dist) * speed * (0.5 + Math.random() * 0.5),
      vy:            (dy / dist) * speed * (0.4 + Math.random() * 0.5) - (0.8 + Math.random() * 2),
      rotation:      (Math.random() - 0.5) * 0.12,
      rotationSpeed: (Math.random() - 0.5) * 0.055,
      vertices:      relVerts,
      // Store cropped snapshot + offset so texture maps correctly
      snapshot:      croppedSnapshot,
      snapOffsetX:   cropOffsetX,
      snapOffsetY:   cropOffsetY,
      phase:         'burst',
      phaseTimer:    0,
      opacity:       0.93 + Math.random() * 0.07,
      restY:         canvasH - BOTTOM_MARGIN,
      tint:          `rgba(${130 + Math.floor(Math.random()*60)},${185 + Math.floor(Math.random()*60)},255,0.07)`
    });
  }

  // Cap total fragments — remove oldest when exceeded
  if (fragments.length > MAX_FRAGMENTS) {
    fragments.splice(0, fragments.length - MAX_FRAGMENTS);
  }
}

// ── Screen hole ───────────────────────────────────────────────────────
// A persistent white region at the impact point that lingers and fades slowly

function spawnScreenHole(cx, cy, radius) {
  screenHoles.push({
    x: cx, y: cy,
    radius,
    opacity: 1,
    life:    FADE_DELAY + 120,   // stays until fragments start fading
    maxLife: FADE_DELAY + 120
  });

  // Cap screen holes to prevent infinite accumulation
  if (screenHoles.length > 30) {
    screenHoles.splice(0, screenHoles.length - 30);
  }
}

// ── Crack network ─────────────────────────────────────────────────────

function buildCrackSegments(x, y, angle, length, depth) {
  const segments = [];
  let curX = x, curY = y;
  const numSeg = 3 + Math.floor(Math.random() * 3);
  const segLen = length / numSeg;

  for (let i = 0; i < numSeg; i++) {
    const jitter   = (Math.random() - 0.5) * 0.3;
    const endAngle = angle + jitter;
    const endX     = curX + Math.cos(endAngle) * segLen;
    const endY     = curY + Math.sin(endAngle) * segLen;
    segments.push({ x1: curX, y1: curY, x2: endX, y2: endY, depth });

    if (depth > 1 && Math.random() > 0.55) {
      const branchAngle = endAngle + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
      const branchLen   = segLen * (0.4 + Math.random() * 0.3);
      segments.push(...buildCrackSegments(endX, endY, branchAngle, branchLen * (depth - 1), depth - 1));
    }

    curX  = endX;
    curY  = endY;
    angle = endAngle;
  }
  return segments;
}

function spawnCrackNetwork(cx, cy) {
  const primaryCount = 7 + Math.floor(Math.random() * 5);
  const rays = [];
  for (let i = 0; i < primaryCount; i++) {
    const angle  = (Math.PI * 2 * i) / primaryCount + (Math.random() - 0.5) * 0.6;
    const length = 55 + Math.random() * 120;
    rays.push(buildCrackSegments(cx, cy, angle, length, MAX_CRACK_DEPTH));
  }
  crackNetworks.push({ x: cx, y: cy, rays, life: CRACK_LIFETIME, maxLife: CRACK_LIFETIME });
}

// ── Public API ────────────────────────────────────────────────────────

export function queueShatter(x, y) {
  pendingShatters.push({ x, y });
}

/**
 * Called during render after scene is drawn.
 * Takes a CROPPED snapshot around impact and spawns fragments + hole.
 * This allows fragments to pile up without blowing up memory.
 * @param {HTMLCanvasElement} canvas  — the physical canvas element
 * @param {number} logicalW           — CSS pixel width
 * @param {number} logicalH           — CSS pixel height
 */
export function processPendingShatters(canvas, logicalW, logicalH) {
  if (pendingShatters.length === 0) return;

  // Take one full snapshot into the reusable canvas
  const { canvas: snapFull, ctx: snapCtx } = getSnapshotCanvas(logicalW, logicalH);
  snapCtx.clearRect(0, 0, logicalW, logicalH);
  snapCtx.drawImage(canvas, 0, 0, logicalW, logicalH);

  for (const { x, y } of pendingShatters) {
    const radius = 80 + Math.random() * 50;

    // Crop a region around the impact point (with padding)
    const cropPad = 180; // enough to cover fragment radius + texture
    const cropX   = Math.max(0, Math.floor(x - cropPad));
    const cropY   = Math.max(0, Math.floor(y - cropPad));
    const cropW   = Math.min(logicalW - cropX, cropPad * 2);
    const cropH   = Math.min(logicalH - cropY, cropPad * 2);

    // Create a small cropped canvas for this shatter event
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width  = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(snapFull, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    spawnFragments(x, y, cropCanvas, cropX, cropY, logicalH);
    spawnScreenHole(x, y, radius);
    // No crack network — missed shots leave clean blank marks
  }
  pendingShatters = [];
}

export function updateShatter(canvasW, canvasH) {
  // Crack networks
  let ci = 0;
  for (let i = 0; i < crackNetworks.length; i++) {
    crackNetworks[i].life--;
    if (crackNetworks[i].life > 0) crackNetworks[ci++] = crackNetworks[i];
  }
  crackNetworks.length = ci;

  // Screen holes — fade after their lifetime
  let hi = 0;
  for (let i = 0; i < screenHoles.length; i++) {
    const h = screenHoles[i];
    h.life--;
    if (h.life <= 0) {
      h.opacity -= 0.015;   // fade out
    }
    if (h.opacity > 0) screenHoles[hi++] = h;
  }
  screenHoles.length = hi;

  // Fragments
  let fi = 0;
  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    f.phaseTimer++;

    switch (f.phase) {
      case 'burst':
        f.x += f.vx; f.y += f.vy;
        f.rotation      += f.rotationSpeed;
        f.vx            *= 0.87; f.vy *= 0.87;
        if (f.phaseTimer >= BURST_FRAMES) { f.phase = 'falling'; f.phaseTimer = 0; }
        break;

      case 'falling':
        f.vy += FRAG_GRAVITY;
        f.x  += f.vx; f.y += f.vy;
        f.vx *= 0.993;
        f.rotation      += f.rotationSpeed;
        f.rotationSpeed *= 0.998;

        let maxDown = 0;
        for (const v of f.vertices) {
          const ry = v.x * Math.sin(f.rotation) + v.y * Math.cos(f.rotation);
          if (ry > maxDown) maxDown = ry;
        }
        if (f.y + maxDown >= f.restY) {
          f.phase = 'resting'; f.phaseTimer = 0;
          f.y     = f.restY - maxDown;
          f.vy    = -Math.abs(f.vy) * 0.07;
          f.vx   *= 0.15;
          f.rotationSpeed *= 0.08;
        }
        if (f.x < 30)           { f.x = 30;           f.vx =  Math.abs(f.vx) * 0.25; }
        if (f.x > canvasW - 30) { f.x = canvasW - 30; f.vx = -Math.abs(f.vx) * 0.25; }
        break;

      case 'resting':
        f.x        += (Math.random() - 0.5) * REST_JITTER;
        f.y        += (Math.random() - 0.5) * REST_JITTER * 0.15;
        f.rotation += (Math.random() - 0.5) * 0.003;
        f.vx       *= 0.82; f.vy *= 0.82;
        f.x        += f.vx; f.y += f.vy;

        let maxD2 = 0;
        for (const v of f.vertices) {
          const ry = v.x * Math.sin(f.rotation) + v.y * Math.cos(f.rotation);
          if (ry > maxD2) maxD2 = ry;
        }
        if (f.y + maxD2 > f.restY) { f.y = f.restY - maxD2; f.vy = 0; }
        if (f.phaseTimer >= FADE_DELAY) { f.phase = 'fading'; f.phaseTimer = 0; }
        break;

      case 'fading':
        f.x        += (Math.random() - 0.5) * REST_JITTER * 0.3;
        f.rotation += (Math.random() - 0.5) * 0.0015;
        f.opacity  -= FADE_RATE;
        break;
    }

    if (f.opacity > 0.01) fragments[fi++] = f;
  }
  fragments.length = fi;
}

export function drawShatter(ctx, canvasW, canvasH) {
  // ── Screen holes — blank white voids where glass was torn away ───────
  for (const hole of screenHoles) {
    if (hole.opacity <= 0) continue;
    ctx.save();
    // Clean blank (white) circle — as if screen is punched through
    const grad = ctx.createRadialGradient(hole.x, hole.y, 0, hole.x, hole.y, hole.radius);
    grad.addColorStop(0,    `rgba(255,255,255,${hole.opacity * 0.95})`);
    grad.addColorStop(0.5,  `rgba(245,245,250,${hole.opacity * 0.85})`);
    grad.addColorStop(0.8,  `rgba(230,230,240,${hole.opacity * 0.4})`);
    grad.addColorStop(1,    'rgba(220,220,230,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle dark rim around the blank hole for definition
    ctx.globalAlpha = hole.opacity * 0.25;
    ctx.strokeStyle = 'rgba(80,80,100,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Crack networks ──────────────────────────────────────────────────
  for (const net of crackNetworks) {
    const alpha = Math.pow(net.life / net.maxLife, 0.6);
    ctx.save();

    for (const ray of net.rays) {
      for (const seg of ray) {
        const depthAlpha = alpha * (seg.depth / MAX_CRACK_DEPTH);
        const lw         = 0.6 + seg.depth * 0.5;

        // Dark crack body
        ctx.globalAlpha = depthAlpha * 0.8;
        ctx.strokeStyle = 'rgba(0,0,0,0.95)';
        ctx.lineWidth   = lw + 1.2;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();

        // Bright specular edge
        ctx.globalAlpha = depthAlpha * 0.6;
        ctx.strokeStyle = 'rgba(220,240,255,0.95)';
        ctx.lineWidth   = lw * 0.4;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
    }

    // Impact flash
    if (alpha > 0.4) {
      const r    = 14 * alpha;
      const grad = ctx.createRadialGradient(net.x, net.y, 0, net.x, net.y, r * 3);
      grad.addColorStop(0,   `rgba(255,255,255,${alpha * 0.95})`);
      grad.addColorStop(0.4, `rgba(210,230,255,${alpha * 0.5})`);
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle   = grad;
      ctx.beginPath();
      ctx.arc(net.x, net.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Glass fragments with screen-texture ─────────────────────────────
  for (const f of fragments) {
    if (f.opacity < 0.01) continue;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.globalAlpha = f.opacity;

    // Clip to polygon
    ctx.beginPath();
    ctx.moveTo(f.vertices[0].x, f.vertices[0].y);
    for (let i = 1; i < f.vertices.length; i++) ctx.lineTo(f.vertices[i].x, f.vertices[i].y);
    ctx.closePath();
    ctx.clip();

    // Draw captured screen content — undo rotation so texture stays aligned
    // Use cropped snapshot with offset for correct texture mapping
    ctx.rotate(-f.rotation);
    ctx.drawImage(f.snapshot, -(f.originX - f.snapOffsetX), -(f.originY - f.snapOffsetY));
    ctx.rotate(f.rotation);

    // Subtle glass tint
    ctx.fillStyle = f.tint;
    ctx.beginPath();
    ctx.moveTo(f.vertices[0].x, f.vertices[0].y);
    for (let i = 1; i < f.vertices.length; i++) ctx.lineTo(f.vertices[i].x, f.vertices[i].y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Glass edges — dark crack + bright specular
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);

    ctx.beginPath();
    ctx.moveTo(f.vertices[0].x, f.vertices[0].y);
    for (let i = 1; i < f.vertices.length; i++) ctx.lineTo(f.vertices[i].x, f.vertices[i].y);
    ctx.closePath();

    ctx.globalAlpha = f.opacity * 0.8;
    ctx.strokeStyle = 'rgba(0,10,30,0.9)';
    ctx.lineWidth   = 1.6;
    ctx.stroke();

    ctx.globalAlpha = f.opacity * 0.5;
    ctx.strokeStyle = 'rgba(180,220,255,0.95)';
    ctx.lineWidth   = 0.5;
    ctx.stroke();

    ctx.restore();
  }
}

export function clearShatter() {
  pendingShatters = [];
  fragments       = [];
  crackNetworks   = [];
  screenHoles     = [];
}
