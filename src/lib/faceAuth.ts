import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs";

const FACE_API_MODEL_URL = "/models/face-api";
const LIVENESS_MODEL_URL = "/models/liveness/model.json";
// Mirrors config.SPOOF_THRESHOLD / FACE_MATCH_TOLERANCE from the Python prototype.
export const SPOOF_THRESHOLD = 0.65;
export const FACE_MATCH_TOLERANCE = 0.55;

let modelsLoaded = false;
let livenessModel: tf.LayersModel | null = null;

/** Loads face-api.js (detector + landmarks + recognition) and the converted
 * liveness model. Safe to call multiple times -- only loads once. */
export async function loadFaceModels() {
  if (!modelsLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL);
    modelsLoaded = true;
  }
  if (!livenessModel) {
    try {
      livenessModel = await tf.loadLayersModel(LIVENESS_MODEL_URL);
    } catch {
      // Liveness model not deployed yet (see public/models/liveness/README.md).
      // Detection/recognition still work; spoofProbability() falls back to 0.
      livenessModel = null;
    }
  }
}

export type DetectedFace = {
  descriptor: Float32Array; // 128-d face-api.js embedding
  box: faceapi.Box;
  landmarks: faceapi.Point[]; // 68 points, raw (un-mirrored) video coordinates
};

/** Detects the largest face in a video frame and returns its embedding.
 * Uses a multi-resolution fallback strategy to maximize detection accuracy. */
export async function detectFace(
  input: HTMLVideoElement
): Promise<DetectedFace | null> {
  if (!input || input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
    return null;
  }

  // 1st attempt: High-resolution (512px) for sharp precision
  let result = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.25 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  // 2nd attempt: Standard resolution (320px) with lower confidence score
  if (!result) {
    result = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  // 3rd attempt: Fast resolution (224px) for low-light or angled faces
  if (!result) {
    result = await faceapi
      .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.15 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  if (!result) return null;
  return {
    descriptor: result.descriptor,
    box: result.detection.box,
    landmarks: result.landmarks.positions,
  };
}

/** Horizontal head-turn ratio from the jawline + nose tip: 0 = nose at the
 * left jaw edge, 1 = nose at the right jaw edge, ~0.5 = facing forward.
 * Direction-agnostic on purpose -- see FaceLivenessCapture for why. */
export function yawRatio(landmarks: faceapi.Point[]): number {
  const leftJaw = landmarks[0];
  const rightJaw = landmarks[16];
  const noseTip = landmarks[30];
  const span = rightJaw.x - leftJaw.x;
  if (Math.abs(span) < 1e-3) return 0.5;
  return (noseTip.x - leftJaw.x) / span;
}

/** Runs the converted liveness model on the cropped face region.
 * Returns spoof probability in [0, 1]; 0 if the model isn't loaded
 * (treated as "unknown, don't block" -- see AttendancePage). */
export async function spoofProbability(
  video: HTMLVideoElement,
  box: faceapi.Box
): Promise<number | null> {
  if (!livenessModel) return null;

  return tf.tidy(() => {
    const frame = tf.browser.fromPixels(video);
    const face = frame.slice(
      [Math.max(0, Math.round(box.y)), Math.max(0, Math.round(box.x)), 0],
      [Math.round(box.height), Math.round(box.width), 3]
    );
    // Matches attendance_system.py's predict_spoof_probability: resize to
    // 224x224, RGB, scale to [0,1].
    const resized = tf.image.resizeBilinear(face as tf.Tensor3D, [224, 224]);
    const normalized = resized.div(255.0).expandDims(0);
    const pred = livenessModel!.predict(normalized) as tf.Tensor;
    return pred.dataSync()[0];
  });
}

/** Euclidean distance between two 128-d descriptors (same metric face-api.js
 * and dlib's face_recognition both use). */
export function descriptorDistance(a: Float32Array | number[], b: Float32Array | number[]) {
  return faceapi.euclideanDistance(a as Float32Array, b as Float32Array);
}

export type KnownFace = { employeeId: string; descriptor: number[] };

/** Finds the closest known employee under FACE_MATCH_TOLERANCE.
 * Mirrors match_face() in attendance_system.py. */
export function matchFace(
  liveDescriptor: Float32Array,
  known: KnownFace[]
): { employeeId: string; distance: number } | null {
  let best: { employeeId: string; distance: number } | null = null;
  for (const k of known) {
    const d = descriptorDistance(liveDescriptor, k.descriptor);
    if (!best || d < best.distance) best = { employeeId: k.employeeId, distance: d };
  }
  if (best && best.distance < FACE_MATCH_TOLERANCE) return best;
  return null;
}
