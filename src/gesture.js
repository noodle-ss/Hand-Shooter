// ═══════════════════════════════════════════════════
// gesture.js — Thumb-bend detection + stable aim tracking
//
// FIXES:
//  1. Proper One-Euro Filter replaces ad-hoc EMA — eliminates jitter on slow
//     moves while keeping fast intentional movements responsive.
//  2. At-camera AIM FREEZE: when the finger is foreshortened (pointing at cam)
//     the aim point is frozen in place instead of jittering wildly.
//  3. Thumb debounce: thumb must be bent for BEND_CONFIRM_FRAMES consecutive
//     frames before a FIRE event is emitted — kills false triggers.
//  4. Post-fire release gate: after firing, thumb must fully release
//     (below THUMB_BEND_OFF for RELEASE_FRAMES frames) before re-arming.
//  5. Entry guard: after HAND_LOCK, thumb is not armed until it has been
//     seen in a "released" state at least once — prevents firing on hand entry.
// ═══════════════════════════════════════════════════

import { LANDMARKS } from './hand-tracker.js';

export const GESTURE = {
  THUMB_FIRE: 'THUMB_FIRE',
  HAND_LOCK:  'HAND_LOCK',
  HAND_LOST:  'HAND_LOST'
};

// ─── One-Euro Filter ──────────────────────────────
// Reference: Casiez et al. 2012 — https://inria.hal.science/hal-00670496/document
// Eliminates jitter on slow/noisy signals while keeping fast moves snappy.

class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.007, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta      = beta;
    this.dCutoff   = dCutoff;
    this._x        = null;   // filtered signal
    this._dx       = 0;      // filtered derivative
    this._lastTime = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, timestamp) {
    if (this._x === null) {
      this._x  = x;
      this._lastTime = timestamp;
      return x;
    }

    const dt = Math.max((timestamp - this._lastTime) / 1000, 0.001); // seconds
    this._lastTime = timestamp;

    // Derivative
    const dx    = (x - this._x) / dt;
    const aDx   = this._alpha(this.dCutoff, dt);
    this._dx    = aDx * dx + (1 - aDx) * this._dx;

    // Adaptive cutoff — rises with speed so fast moves get less lag
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    const a      = this._alpha(cutoff, dt);
    this._x      = a * x + (1 - a) * this._x;

    return this._x;
  }

  reset() { this._x = null; this._dx = 0; this._lastTime = null; }
}

// ─── Aim filters ──────────────────────────────────
// minCutoff=0.6 → smoother at rest; beta=0.004 → fast moves still pass through
const filterX = new OneEuroFilter({ minCutoff: 0.6, beta: 0.004, dCutoff: 1.0 });
const filterY = new OneEuroFilter({ minCutoff: 0.6, beta: 0.004, dCutoff: 1.0 });

// At-camera hysteresis thresholds — enter at tighter threshold, exit at looser.
// Prevents the detector from flickering rapidly on the boundary.
const AT_CAM_ENTER_DIST = 0.055;  // must be this foreshortened to enter freeze
const AT_CAM_EXIT_DIST  = 0.085;  // must open up this much to leave freeze
const AT_CAM_ENTER_DZ   = -0.010;
const AT_CAM_EXIT_DZ    = -0.005;

// Blend-zone: frames over which we cross-fade from frozen→live after exiting
const BLEND_FRAMES = 22;  // ~0.7s at 30fps — long enough to feel smooth

// ─── Thumb-bend state ─────────────────────────────
const THUMB_BEND_ON  = 0.42;   // must exceed this to start arming
const THUMB_BEND_OFF = 0.25;   // must drop below this to release

// Debounce: thumb must be bent for this many consecutive frames to fire
const BEND_CONFIRM_FRAMES = 6;   // ~200ms at 30fps — kills single-frame spikes

// Release gate: must be released for this many frames before re-arming
const RELEASE_FRAMES = 12;       // ~400ms — prevents re-fires after a shot

// Cooldown after each fire (hard lockout regardless of release state)
const FIRE_COOLDOWN   = 22;      // ~0.7s at 30fps

const HAND_LOST_THRESHOLD = 30;  // frames before HAND_LOST event

let thumbBendSmoothed = 0;
let wasThumbBent      = false;
let bendConfirmCount  = 0;       // consecutive bent frames
let releaseCount      = 0;       // consecutive released frames
let thumbArmed        = false;   // true only after at least one clean release
let fireCooldown      = 0;
let handLostFrames    = 0;
let wasHandDetected   = false;
let lastAimPoint      = null;
let frozenAimPoint    = null;    // held when pointing at camera

// Blend-zone state — used when transitioning OUT of at-camera mode
let isAtCamera    = false;       // hysteresis state (not raw per-frame)
let blendFrame    = 0;           // 0 = not blending; >0 counts up to BLEND_FRAMES
let blendStartX   = 0;           // frozen position at blend start
let blendStartY   = 0;

// ─── Angle helper ─────────────────────────────────
function angleBetween(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot  = abx * cbx + aby * cby;
  const magA = Math.sqrt(abx * abx + aby * aby);
  const magC = Math.sqrt(cbx * cbx + cby * cby);
  if (magA === 0 || magC === 0) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC)))) * (180 / Math.PI);
}

// ─── Thumb bend score (0..1) ──────────────────────
function getThumbBend(lm) {
  const tip      = lm[LANDMARKS.THUMB_TIP];
  const ip       = lm[LANDMARKS.THUMB_IP];
  const mcp      = lm[LANDMARKS.THUMB_MCP];
  const cmc      = lm[LANDMARKS.THUMB_CMC];
  const indexMCP = lm[LANDMARKS.INDEX_MCP];

  // Method 1: joint angles
  const angleMCP  = angleBetween(cmc, mcp, ip);
  const angleIP   = angleBetween(mcp, ip, tip);
  const angleBend = Math.max(0, Math.min(1, (180 - (angleMCP + angleIP) / 2) / 100));

  // Method 2: tip proximity to index MCP
  const dx1 = tip.x - indexMCP.x;
  const dy1 = tip.y - indexMCP.y;
  const proximityBend = Math.max(0, Math.min(1, (0.15 - Math.sqrt(dx1 * dx1 + dy1 * dy1)) / 0.10));

  // Method 3: tip drop below CMC (downward curl)
  const dropBend = Math.max(0, Math.min(1, (tip.y - cmc.y) * 8));

  return Math.max(angleBend, proximityBend, dropBend);
}

// ─── Raw projected aim (no filtering) ────────────
function computeRawAim(lm) {
  const indexMCP = lm[LANDMARKS.INDEX_MCP];
  const indexPIP = lm[LANDMARKS.INDEX_PIP];
  const indexDIP = lm[LANDMARKS.INDEX_DIP];
  const indexTip = lm[LANDMARKS.INDEX_TIP];

  const dx2d   = indexTip.x - indexMCP.x;
  const dy2d   = indexTip.y - indexMCP.y;
  const dist2d = Math.sqrt(dx2d * dx2d + dy2d * dy2d);
  const dz     = (indexTip.z || 0) - (indexMCP.z || 0);

  const dx1 = indexDIP.x - indexPIP.x;
  const dy1 = indexDIP.y - indexPIP.y;
  const dx2 = indexTip.x - indexDIP.x;
  const dy2 = indexTip.y - indexDIP.y;
  const avgDx = dx1 * 0.35 + dx2 * 0.65;
  const avgDy = dy1 * 0.35 + dy2 * 0.65;

  const projectDist = Math.max(0.12, dist2d * 2.2);
  const mag = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
  let rawX, rawY;
  if (mag > 0.001) {
    rawX = indexTip.x + (avgDx / mag) * projectDist;
    rawY = indexTip.y + (avgDy / mag) * projectDist;
  } else {
    rawX = indexTip.x;
    rawY = indexTip.y;
  }

  return {
    rawX:   Math.max(0, Math.min(1, rawX)),
    rawY:   Math.max(0, Math.min(1, rawY)),
    dist2d,
    dz
  };
}

// ─── Aim point with hysteresis + blend-zone ───────
//
// State machine:
//   NORMAL  → FROZEN   when dist2d < AT_CAM_ENTER_DIST && dz < AT_CAM_ENTER_DZ
//   FROZEN  → BLENDING when dist2d > AT_CAM_EXIT_DIST  || dz > AT_CAM_EXIT_DZ
//   BLENDING→ NORMAL   after BLEND_FRAMES frames
//
// During BLENDING the output is a smooth lerp between the frozen point and the
// live One-Euro output.  The filter is pre-seeded at the frozen position the
// moment blending starts, so it has no large initial error to "snap" from.
export function getAimPoint(lm) {
  const now = performance.now();
  const { rawX, rawY, dist2d, dz } = computeRawAim(lm);

  // ── Hysteresis: decide whether we are "at camera" ──
  if (!isAtCamera) {
    // Enter freeze only when firmly foreshortened
    if (dist2d < AT_CAM_ENTER_DIST && dz < AT_CAM_ENTER_DZ) {
      isAtCamera = true;
      // Snapshot the current filtered position as the freeze point
      frozenAimPoint = {
        x: filterX._x ?? rawX,
        y: filterY._x ?? rawY
      };
    }
  } else {
    // Exit freeze only when finger has clearly turned away (hysteresis gap)
    if (dist2d > AT_CAM_EXIT_DIST || dz > AT_CAM_EXIT_DZ) {
      isAtCamera = false;
      // Start blend from frozen position
      blendFrame  = 1;
      blendStartX = frozenAimPoint ? frozenAimPoint.x : rawX;
      blendStartY = frozenAimPoint ? frozenAimPoint.y : rawY;
      // Pre-seed the One-Euro filter at the frozen position so it has no
      // sudden "jump" to the current raw landmark position.
      filterX._x        = blendStartX;
      filterX._lastTime = now;
      filterY._x        = blendStartY;
      filterY._lastTime = now;
      frozenAimPoint = null;
    }
  }

  // ── FROZEN state ──────────────────────────────────
  if (isAtCamera) {
    return { aimPoint: frozenAimPoint, isPointingAtCamera: true };
  }

  // ── Run the One-Euro filter on the live aim ───────
  const filtX = filterX.filter(rawX, now);
  const filtY = filterY.filter(rawY, now);

  // ── BLENDING state: cross-fade frozen→live ────────
  if (blendFrame > 0 && blendFrame <= BLEND_FRAMES) {
    // Ease-in-out curve so the crosshair eases in rather than linearly sliding
    const t   = blendFrame / BLEND_FRAMES;
    const ease = t * t * (3 - 2 * t);   // smoothstep
    const outX = blendStartX + (filtX - blendStartX) * ease;
    const outY = blendStartY + (filtY - blendStartY) * ease;
    blendFrame++;
    return { aimPoint: { x: outX, y: outY }, isPointingAtCamera: false };
  }

  blendFrame = 0;
  return { aimPoint: { x: filtX, y: filtY }, isPointingAtCamera: false };
}

// ─── Main gesture processor ───────────────────────
export function processGesture(detected, landmarks) {
  if (!detected || !landmarks) {
    handLostFrames++;

    if (handLostFrames < HAND_LOST_THRESHOLD) {
      // Grace period — return last known state so we don't flicker
      return {
        event:           null,
        handDetected:    wasHandDetected,
        thumbBent:       wasThumbBent,
        thumbBendAmount: thumbBendSmoothed,
        aimPoint:        lastAimPoint,
        isPointingAtCamera: false
      };
    }

    if (handLostFrames === HAND_LOST_THRESHOLD && wasHandDetected) {
      wasHandDetected   = false;
      wasThumbBent      = false;
      thumbArmed        = false;
      bendConfirmCount  = 0;
      releaseCount      = 0;
      thumbBendSmoothed = 0;
      return {
        event:           GESTURE.HAND_LOST,
        handDetected:    false,
        thumbBent:       false,
        thumbBendAmount: 0,
        aimPoint:        null,
        isPointingAtCamera: false
      };
    }

    thumbBendSmoothed *= 0.9;
    return {
      event:           null,
      handDetected:    false,
      thumbBent:       false,
      thumbBendAmount: thumbBendSmoothed,
      aimPoint:        null,
      isPointingAtCamera: false
    };
  }

  // ── Hand present ──────────────────────────────────
  const wasLost = !wasHandDetected;
  handLostFrames = 0;

  // Smooth the raw bend value
  const bendRaw     = getThumbBend(landmarks);
  thumbBendSmoothed = thumbBendSmoothed * 0.50 + bendRaw * 0.50;

  // Tick cooldown
  if (fireCooldown > 0) fireCooldown--;

  // ── Entry guard: arm only after first clean release ──
  // When the hand first appears (wasLost), require the thumb to be seen
  // in a released state before we allow firing. This prevents the
  // "fire on entry" bug where the thumb is already bent on detection.
  if (wasLost) {
    thumbArmed       = false;   // disarm on every new hand detection
    bendConfirmCount = 0;
    releaseCount     = 0;
    wasHandDetected  = true;
  }

  // Track release state to arm the trigger
  if (thumbBendSmoothed < THUMB_BEND_OFF) {
    releaseCount++;
    bendConfirmCount = 0;
    if (releaseCount >= RELEASE_FRAMES) {
      thumbArmed = true;   // thumb seen cleanly released → now armed
    }
  } else {
    releaseCount = 0;
  }

  // ── Debounced bend detection ───────────────────────
  let isThumbBent = wasThumbBent;

  if (!wasThumbBent) {
    // Rising edge: count consecutive bent frames
    if (thumbBendSmoothed > THUMB_BEND_ON) {
      bendConfirmCount++;
      if (bendConfirmCount >= BEND_CONFIRM_FRAMES) {
        isThumbBent = true;
      }
    } else {
      bendConfirmCount = 0;
    }
  } else {
    // Falling edge: hysteresis
    if (thumbBendSmoothed < THUMB_BEND_OFF) {
      isThumbBent      = false;
      bendConfirmCount = 0;
    }
  }

  // ── Aim point ────────────────────────────────────
  const { aimPoint, isPointingAtCamera } = getAimPoint(landmarks);
  if (aimPoint) lastAimPoint = aimPoint;

  // ── Event ────────────────────────────────────────
  let event = null;

  if (wasLost) {
    event = GESTURE.HAND_LOCK;
  } else if (isThumbBent && !wasThumbBent && thumbArmed && fireCooldown <= 0) {
    event        = GESTURE.THUMB_FIRE;
    fireCooldown = FIRE_COOLDOWN;
    thumbArmed   = false;  // disarm until next clean release
  }

  wasThumbBent = isThumbBent;

  return {
    event,
    handDetected:    true,
    thumbBent:       isThumbBent,
    thumbBendAmount: thumbBendSmoothed,
    aimPoint,
    isPointingAtCamera
  };
}

// ─── Reset all state ──────────────────────────────
export function resetGesture() {
  wasThumbBent      = false;
  handLostFrames    = 0;
  thumbBendSmoothed = 0;
  wasHandDetected   = false;
  thumbArmed        = false;
  bendConfirmCount  = 0;
  releaseCount      = 0;
  fireCooldown      = 0;
  lastAimPoint      = null;
  frozenAimPoint    = null;
  isAtCamera        = false;
  blendFrame        = 0;
  blendStartX       = 0;
  blendStartY       = 0;
  filterX.reset();
  filterY.reset();
}
