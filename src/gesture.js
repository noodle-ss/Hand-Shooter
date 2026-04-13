// ═══════════════════════════════════════════════════
// gesture.js — Thumb-bend detection + stable aim tracking
// Enhanced: Kalman-style filter, velocity damping, at-camera stabilisation
// ═══════════════════════════════════════════════════

import { LANDMARKS } from './hand-tracker.js';

export const GESTURE = {
  THUMB_FIRE: 'THUMB_FIRE',
  HAND_LOCK:  'HAND_LOCK',
  HAND_LOST:  'HAND_LOST'
};

// ── State ─────────────────────────────────────────
let wasThumbBent      = false;
let handLostFrames    = 0;
const HAND_LOST_THRESHOLD = 30;
let thumbBendSmoothed = 0;
let wasHandDetected   = false;

const THUMB_BEND_ON  = 0.40;
const THUMB_BEND_OFF = 0.22;    // raised from 0.15 — easier to release

// Anti-stuck: auto-reset bent state after MAX_BENT_FRAMES
let thumbBentFrames   = 0;
const MAX_BENT_FRAMES = 25;     // ~0.8s at 30 fps → auto-release

// Cooldown after each fire to prevent jitter re-fires
let fireCooldown      = 0;
const FIRE_COOLDOWN   = 18;     // ~0.6s at 30 fps

// ── Aim tracking state ────────────────────────────
// Two-stage: raw buffer → EMA smooth → velocity-based prediction
let smoothAimX = 0.5;
let smoothAimY = 0.5;
let aimVelX    = 0;
let aimVelY    = 0;
let lastAimPoint = null;

// Multi-frame buffer for median pre-filter (removes outlier spikes)
const AIM_BUFFER_SIZE = 6;
const aimBuffer = [];

// Dead-zone: ignore sub-threshold movements (noise floor)
const AIM_DEADZONE = 0.003;

// Adaptive EMA factors
const SMOOTH_NORMAL   = 0.28;   // responsive when not pointing at cam
const SMOOTH_AT_CAM   = 0.82;   // very heavy smoothing when foreshortened
const SMOOTH_FAST_MOV = 0.15;   // lighter smoothing on fast intentional moves

// Velocity smoothing (prevents overshooting)
const VEL_DECAY  = 0.75;
const VEL_WEIGHT = 0.12;   // how much velocity prediction contributes

// ── Thumb bend ────────────────────────────────────

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot    = ab.x * cb.x + ab.y * cb.y;
  const magAB  = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB  = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
  if (magAB === 0 || magCB === 0) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * (180 / Math.PI);
}

function getThumbBend(landmarks) {
  const wrist    = landmarks[LANDMARKS.WRIST];
  const cmc      = landmarks[LANDMARKS.THUMB_CMC];
  const mcp      = landmarks[LANDMARKS.THUMB_MCP];
  const ip       = landmarks[LANDMARKS.THUMB_IP];
  const tip      = landmarks[LANDMARKS.THUMB_TIP];
  const indexMCP = landmarks[LANDMARKS.INDEX_MCP];

  const dx1 = tip.x - indexMCP.x;
  const dy1 = tip.y - indexMCP.y;
  const distToIndex = Math.sqrt(dx1 * dx1 + dy1 * dy1);

  const thumbDrop = tip.y - cmc.y;

  const angleMCP = angleBetween(cmc, mcp, ip);
  const angleIP  = angleBetween(mcp, ip, tip);
  const angleBend = Math.max(0, Math.min(1, (180 - (angleMCP + angleIP) / 2) / 100));

  const proximityBend = Math.max(0, Math.min(1, (0.15 - distToIndex) / 0.10));
  const dropBend      = Math.max(0, Math.min(1, thumbDrop * 8));

  return Math.max(angleBend, proximityBend, dropBend);
}

// ── Aim point ─────────────────────────────────────

/**
 * Median of an array of numbers — removes outlier spikes from buffer
 */
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function getAimPoint(landmarks) {
  const indexMCP = landmarks[LANDMARKS.INDEX_MCP];
  const indexPIP = landmarks[LANDMARKS.INDEX_PIP];
  const indexDIP = landmarks[LANDMARKS.INDEX_DIP];
  const indexTip = landmarks[LANDMARKS.INDEX_TIP];

  // 2D projection length of the index finger
  const dx2d = indexTip.x - indexMCP.x;
  const dy2d = indexTip.y - indexMCP.y;
  const dist2d = Math.sqrt(dx2d * dx2d + dy2d * dy2d);

  // Z-depth: negative = tip closer to camera
  const dz = (indexTip.z || 0) - (indexMCP.z || 0);

  // Foreshortening threshold — finger appears short when pointing at camera
  const isPointingAtCamera = dist2d < 0.07 && dz < -0.015;

  let rawX, rawY;

  if (isPointingAtCamera) {
    // Pointing at camera: use tip position directly
    // But also average nearby tip positions from PIP for extra stability
    rawX = indexTip.x * 0.6 + indexPIP.x * 0.4;
    rawY = indexTip.y * 0.6 + indexPIP.y * 0.4;
  } else {
    // Normal pointing: project finger direction forward
    const dx1 = indexDIP.x - indexPIP.x;
    const dy1 = indexDIP.y - indexPIP.y;
    const dx2 = indexTip.x - indexDIP.x;
    const dy2 = indexTip.y - indexDIP.y;
    const avgDx = dx1 * 0.4 + dx2 * 0.6;   // weight toward tip segment
    const avgDy = dy1 * 0.4 + dy2 * 0.6;

    const projectDist = Math.max(0.12, dist2d * 2.2);
    const mag = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
    if (mag > 0.001) {
      rawX = indexTip.x + (avgDx / mag) * projectDist;
      rawY = indexTip.y + (avgDy / mag) * projectDist;
    } else {
      rawX = indexTip.x;
      rawY = indexTip.y;
    }
  }

  rawX = Math.max(0, Math.min(1, rawX));
  rawY = Math.max(0, Math.min(1, rawY));

  // Stage 1: Multi-frame buffer for median pre-filter
  aimBuffer.push({ x: rawX, y: rawY });
  if (aimBuffer.length > AIM_BUFFER_SIZE) aimBuffer.shift();

  // Use median to kill outlier spikes from tracking noise
  const bufX = median(aimBuffer.map(b => b.x));
  const bufY = median(aimBuffer.map(b => b.y));

  // Stage 2: Dead-zone — ignore micro-jitter
  const dxAim = bufX - smoothAimX;
  const dyAim = bufY - smoothAimY;
  const moveDist = Math.sqrt(dxAim * dxAim + dyAim * dyAim);

  if (moveDist < AIM_DEADZONE) {
    return { aimPoint: { x: smoothAimX, y: smoothAimY }, isPointingAtCamera };
  }

  // Stage 3: Adaptive EMA
  // Fast movement = lighter smoothing (intentional), slow = heavier (likely jitter)
  let smoothFactor;
  if (isPointingAtCamera) {
    smoothFactor = SMOOTH_AT_CAM;
  } else if (moveDist > 0.04) {
    smoothFactor = SMOOTH_FAST_MOV;  // intentional fast move
  } else {
    smoothFactor = SMOOTH_NORMAL;
  }

  // Stage 4: Velocity-assisted prediction
  // Damp the velocity first, then blend in new velocity
  aimVelX = aimVelX * VEL_DECAY + (bufX - smoothAimX) * (1 - VEL_DECAY);
  aimVelY = aimVelY * VEL_DECAY + (bufY - smoothAimY) * (1 - VEL_DECAY);

  // Predicted target (ahead of current position by one frame)
  const predX = bufX + aimVelX * VEL_WEIGHT;
  const predY = bufY + aimVelY * VEL_WEIGHT;

  smoothAimX = smoothAimX * smoothFactor + predX * (1 - smoothFactor);
  smoothAimY = smoothAimY * smoothFactor + predY * (1 - smoothFactor);

  // Clamp final
  smoothAimX = Math.max(0, Math.min(1, smoothAimX));
  smoothAimY = Math.max(0, Math.min(1, smoothAimY));

  return { aimPoint: { x: smoothAimX, y: smoothAimY }, isPointingAtCamera };
}

// ── Main gesture processor ─────────────────────────

export function processGesture(detected, landmarks) {
  if (!detected || !landmarks) {
    handLostFrames++;

    if (handLostFrames < HAND_LOST_THRESHOLD) {
      return {
        event:           null,
        handDetected:    wasHandDetected,
        thumbBent:       wasThumbBent,
        thumbBendAmount: thumbBendSmoothed,
        aimPoint:        lastAimPoint
      };
    }

    if (handLostFrames === HAND_LOST_THRESHOLD && wasHandDetected) {
      wasHandDetected   = false;
      wasThumbBent      = false;
      thumbBendSmoothed *= 0.8;
      aimVelX = 0;
      aimVelY = 0;
      return {
        event:           GESTURE.HAND_LOST,
        handDetected:    false,
        thumbBent:       false,
        thumbBendAmount: thumbBendSmoothed,
        aimPoint:        null
      };
    }

    thumbBendSmoothed *= 0.95;
    return {
      event:           null,
      handDetected:    false,
      thumbBent:       false,
      thumbBendAmount: thumbBendSmoothed,
      aimPoint:        null
    };
  }

  const wasLost = !wasHandDetected;
  handLostFrames = 0;

  const bendRaw = getThumbBend(landmarks);
  thumbBendSmoothed = thumbBendSmoothed * 0.55 + bendRaw * 0.45;   // slightly less sticky

  // Tick cooldown
  if (fireCooldown > 0) fireCooldown--;

  let isThumbBent = wasThumbBent
    ? thumbBendSmoothed > THUMB_BEND_OFF
    : thumbBendSmoothed > THUMB_BEND_ON;

  // Anti-stuck: if bent for too long, force release so user can re-fire
  if (isThumbBent) {
    thumbBentFrames++;
    if (thumbBentFrames >= MAX_BENT_FRAMES) {
      isThumbBent     = false;
      thumbBentFrames = 0;
    }
  } else {
    thumbBentFrames = 0;
  }

  const { aimPoint } = getAimPoint(landmarks);
  if (aimPoint) lastAimPoint = aimPoint;

  let event = null;
  if (wasLost) {
    event = GESTURE.HAND_LOCK;
  } else if (isThumbBent && !wasThumbBent && fireCooldown <= 0) {
    event = GESTURE.THUMB_FIRE;
    fireCooldown = FIRE_COOLDOWN;   // start cooldown after fire
  }

  wasThumbBent    = isThumbBent;
  wasHandDetected = true;

  return {
    event,
    handDetected:    true,
    thumbBent:       isThumbBent,
    thumbBendAmount: thumbBendSmoothed,
    aimPoint
  };
}

export function resetGesture() {
  wasThumbBent      = false;
  handLostFrames    = 0;
  thumbBendSmoothed = 0;
  wasHandDetected   = false;
  thumbBentFrames   = 0;
  fireCooldown      = 0;
  smoothAimX        = 0.5;
  smoothAimY        = 0.5;
  aimVelX           = 0;
  aimVelY           = 0;
  lastAimPoint      = null;
  aimBuffer.length  = 0;
}
