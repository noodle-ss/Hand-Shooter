// ═══════════════════════════════════════════════════
// physics.js — Velocity, gravity, collision
// ═══════════════════════════════════════════════════

const GRAVITY = 0.03;       // Much gentler gravity — windows float/drift slowly
const AIR_DRAG = 0.997;
const ANGULAR_DRAG = 0.995;
const HIT_IMPULSE = 3;       // Reduced — windows fall mostly downward, not fly off
const HIT_SPIN = 0.08;
const SHATTER_LIFETIME = 60; // frames for fade-out
const BOUNCE_DAMPING = 0.5;  // energy kept on boundary bounce
const MAX_PARTICLES = 50;    // cap total particles to prevent lag

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} size
 * @property {string} color
 * @property {number} life
 * @property {number} maxLife
 * @property {number} rotation
 * @property {number} rotationSpeed
 */

let particles = [];

/**
 * Update physics for a single window
 * @param {import('./window-spawner.js').FloatingWindow} win
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function updateWindowPhysics(win, canvasW, canvasH) {
  if (!win.alive) {
    // Fade out dying windows
    win.hitTimer++;
    win.opacity = Math.max(0, 1 - win.hitTimer / SHATTER_LIFETIME);
    win.vy += GRAVITY * 4;      // fall faster when hit
    win.vx *= 0.96;             // dampen horizontal movement
    win.rotationSpeed *= 1.01;  // gentle spin increase

    // Keep dying windows within screen bounds horizontally
    const halfW = (win.width * win.scale) / 2;
    if (win.x - halfW < 0) {
      win.x = halfW;
      win.vx = Math.abs(win.vx) * 0.3;
    }
    if (win.x + halfW > canvasW) {
      win.x = canvasW - halfW;
      win.vx = -Math.abs(win.vx) * 0.3;
    }
  } else {
    // Gentle gravity
    win.vy += GRAVITY;
  }

  // Apply velocity
  win.x += win.vx;
  win.y += win.vy;

  // Drag
  win.vx *= AIR_DRAG;
  win.vy *= AIR_DRAG;

  // Angular
  win.rotation += win.rotationSpeed;
  win.rotationSpeed *= ANGULAR_DRAG;

  // ── Boundary bouncing for alive windows ──────────
  // Keeps windows visible on screen instead of falling off
  if (win.alive) {
    const halfW = (win.width * win.scale) / 2;
    const halfH = (win.height * win.scale) / 2;
    const margin = 10; // padding from edges

    // Bottom boundary
    if (win.y + halfH > canvasH - margin) {
      win.y = canvasH - margin - halfH;
      win.vy = -Math.abs(win.vy) * BOUNCE_DAMPING;
      // Add slight random horizontal nudge on bounce
      win.vx += (Math.random() - 0.5) * 0.3;
    }

    // Top boundary
    if (win.y - halfH < margin) {
      win.y = margin + halfH;
      win.vy = Math.abs(win.vy) * BOUNCE_DAMPING;
    }

    // Right boundary
    if (win.x + halfW > canvasW - margin) {
      win.x = canvasW - margin - halfW;
      win.vx = -Math.abs(win.vx) * BOUNCE_DAMPING;
    }

    // Left boundary
    if (win.x - halfW < margin) {
      win.x = margin + halfW;
      win.vx = Math.abs(win.vx) * BOUNCE_DAMPING;
    }

    // Glow pulsation
    win.glowIntensity = 0.3 + Math.sin(performance.now() * 0.003 + win.id) * 0.15;
  }
}

/**
 * Check if a window is off-screen and should be recycled
 */
export function isOffScreen(win, canvasW, canvasH) {
  const margin = 200;
  return (
    win.x < -margin ||
    win.x > canvasW + margin ||
    win.y > canvasH + margin ||
    win.y < -margin
  );
}

/**
 * Simple point-in-AABB hit test — checks if the aim point is inside the window
 * @param {Object} aimPoint - { x, y } in normalized coords (0..1)
 * @param {import('./window-spawner.js').FloatingWindow} win
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {boolean}
 */
export function hitTestPoint(aimPoint, win, canvasW, canvasH) {
  if (!win.alive) return false;

  // Convert aim point to canvas coords
  const px = aimPoint.x * canvasW;
  const py = aimPoint.y * canvasH;

  // Window AABB bounds (centered on x,y)
  const halfW = (win.width * win.scale) / 2;
  const halfH = (win.height * win.scale) / 2;

  return (
    px >= win.x - halfW &&
    px <= win.x + halfW &&
    py >= win.y - halfH &&
    py <= win.y + halfH
  );
}

/**
 * Apply hit impulse to a window
 * @param {import('./window-spawner.js').FloatingWindow} win
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function applyHit(win, canvasW, canvasH) {
  win.alive = false;
  win.hit = true;
  win.hitTimer = 0;

  // Mostly downward with slight random scatter — stays visible on screen
  win.vx += (Math.random() - 0.5) * HIT_IMPULSE;
  win.vy += 1 + Math.random() * 2;  // push downward
  win.rotationSpeed = (Math.random() - 0.5) * HIT_SPIN;

  // Spawn particles at hit location
  spawnHitParticles(win.x, win.y);
}

/**
 * Spawn shatter particles (optimized — fewer particles, shorter lifetime)
 */
function spawnHitParticles(x, y) {
  const colors = ['#00f0ff', '#ff3d5a', '#a78bfa', '#39ff7f', '#ffc107', '#fff'];
  const count = 8 + Math.floor(Math.random() * 6);

  for (let i = 0; i < count; i++) {
    const angle    = Math.random() * Math.PI * 2;
    const speed    = 2 + Math.random() * 6;
    const lifespan = 20 + Math.floor(Math.random() * 10);  // Bug fix: single value for both
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: lifespan,
      maxLife: lifespan,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3
    });
  }

  // Glass shards (fewer)
  for (let i = 0; i < 4; i++) {
    const angle    = Math.random() * Math.PI * 2;
    const speed    = 3 + Math.random() * 5;
    const lifespan = 22 + Math.floor(Math.random() * 10);  // Bug fix: single value for both
    particles.push({
      x: x + (Math.random() - 0.5) * 30,
      y: y + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 6 + Math.random() * 8,
      color: `rgba(${Math.random() > 0.5 ? '100,200,255' : '255,255,255'}, 0.6)`,
      life: lifespan,
      maxLife: lifespan,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.2
    });
  }

  // Cap total particles to prevent accumulation lag
  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES);
  }
}

/**
 * Update all particles (optimized — avoids splice-in-loop)
 */
export function updateParticles() {
  let writeIdx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GRAVITY * 1.5;
    p.vx *= 0.98;
    p.rotation += p.rotationSpeed;
    p.life--;

    if (p.life > 0) {
      particles[writeIdx++] = p;
    }
  }
  particles.length = writeIdx;
}

/**
 * Get current particles for rendering
 * @returns {Particle[]}
 */
export function getParticles() {
  return particles;
}

/**
 * Clear all particles
 */
export function clearParticles() {
  particles = [];
}
