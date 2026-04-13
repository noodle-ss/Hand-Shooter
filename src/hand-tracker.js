// ═══════════════════════════════════════════════════
// hand-tracker.js — MediaPipe Hands setup + landmark parsing
// ═══════════════════════════════════════════════════

import { HandLandmarker, FilesetResolver } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';

let handLandmarker = null;
let lastVideoTime = -1;
let lastResult = { detected: false, landmarks: null, worldLandmarks: null };

/**
 * Initialize MediaPipe HandLandmarker
 * @param {Function} onProgress - status callback
 * @returns {Promise<void>}
 */
export async function initHandTracker(onProgress) {
  onProgress?.('Loading vision runtime…');
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
  );

  onProgress?.('Loading hand model…');
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.6
  });

  onProgress?.('Hand tracker ready');
}

/**
 * Landmark indices
 */
export const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20
};

/** Connection pairs for skeleton drawing */
export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

/**
 * @typedef {Object} HandState
 * @property {boolean} detected
 * @property {Array|null} landmarks - 21 normalized landmarks [{x,y,z}, ...]
 * @property {Object|null} worldLandmarks
 */

/**
 * Detect hand in current video frame
 * @param {HTMLVideoElement} video
 * @returns {HandState}
 */
export function detectHand(video) {
  if (!handLandmarker || video.readyState < 2) {
    return { detected: false, landmarks: null, worldLandmarks: null };
  }

  // If the video frame hasn't changed, return the last known result
  // instead of false (which would cause lost/locked flickering)
  if (video.currentTime === lastVideoTime) {
    return lastResult;
  }
  lastVideoTime = video.currentTime;

  const results = handLandmarker.detectForVideo(video, performance.now());

  if (results.landmarks && results.landmarks.length > 0) {
    lastResult = {
      detected: true,
      landmarks: results.landmarks[0],
      worldLandmarks: results.worldLandmarks?.[0] || null
    };
  } else {
    lastResult = { detected: false, landmarks: null, worldLandmarks: null };
  }

  return lastResult;
}
