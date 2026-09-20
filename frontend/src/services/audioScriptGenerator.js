// Audio-driven script generation.
//
// Shared by the Auto Sync tab (live: re-runs as you drag a slider, streamed
// straight to the device) and the Scripter's Audio mode (one-shot: the result
// drops into the edit history so it can be cleaned up and saved). Lifted out of
// AutoSync verbatim so the two tabs cannot drift apart.

// Envelope resolution, in samples per second. Fine enough to catch a beat,
// coarse enough that a feature-length file stays comfortably in memory.
export const AUDIO_FPS = 20;

export const DEFAULT_AUDIO_PARAMS = {
  audioType: 'action', // 'action' (smooth build-ups) | 'music' (punchy beats)
  minHeight: 0,
  maxHeight: 100,
  minSpeed: 20,
  maxSpeed: 100,
  smoothing: 70,
  sensitivity: 60,
};

// One context for the page. Browsers cap how many you may open, and decoding
// does not need a running one, so there is no reason to make a context per
// component.
let audioCtx = null;
const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
};

// Decode a video/audio file down to a normalised loudness envelope.
// Throws if the file has no decodable audio track — callers are expected to
// tell the user rather than carry on with an empty envelope.
export async function analyzeAudioFile(file, fps = AUDIO_FPS) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);

  const blockSize = Math.floor(audioBuffer.sampleRate / fps);
  const envelope = [];

  // Every 10th sample is plenty for an RMS at this resolution, and keeps a
  // long file from taking seconds to scan.
  for (let i = 0; i < channelData.length; i += blockSize) {
    let sumSquares = 0;
    let count = 0;
    for (let j = 0; j < blockSize && (i + j) < channelData.length; j += 10) {
      sumSquares += channelData[i + j] * channelData[i + j];
      count++;
    }
    envelope.push(Math.sqrt(sumSquares / count));
  }

  // Normalise against the loudest block so that Sensitivity means the same
  // thing whatever the source was mastered at.
  let maxVal = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > maxVal) maxVal = envelope[i];
  }
  if (maxVal > 0) {
    for (let i = 0; i < envelope.length; i++) {
      envelope[i] = envelope[i] / maxVal;
    }
  }

  return envelope;
}

// Turn a loudness envelope into a funscript: loud passages stroke faster,
// quiet ones slower, always as complete up/down strokes.
export function generateAudioScript(envelope, params = {}, fps = AUDIO_FPS) {
  if (!envelope || envelope.length === 0) return null;

  const {
    audioType, minHeight, maxHeight, minSpeed, maxSpeed, smoothing, sensitivity,
  } = { ...DEFAULT_AUDIO_PARAMS, ...params };

  const controlTrack = [];
  let currentSpeed = 0;

  let actualSmoothing = smoothing;
  if (audioType === 'music') {
    actualSmoothing = Math.max(0, smoothing - 40); // Less smoothing for punchier beats
  }
  const smoothFactor = actualSmoothing / 100;

  for (let i = 0; i < envelope.length; i++) {
    let raw = envelope[i];
    const multiplier = Math.pow(10, (sensitivity - 50) / 30);
    raw = Math.min(1.0, raw * multiplier);

    if (audioType === 'music' && raw > 0.6) {
      raw = Math.min(1.0, raw * 1.5); // Boost peaks
    }

    currentSpeed = (currentSpeed * smoothFactor) + (raw * (1 - smoothFactor));
    controlTrack.push(currentSpeed);
  }

  const actions = [];
  let timeMs = 0;
  const maxTimeMs = (envelope.length / fps) * 1000;
  let isUp = true;

  // Enforce 50% minimum stroke range
  let safeMin = minHeight;
  let safeMax = maxHeight;
  if (safeMax - safeMin < 50) {
    if (safeMin + 50 <= 100) safeMax = safeMin + 50;
    else safeMin = safeMax - 50;
  }

  while (timeMs < maxTimeMs) {
    const index = Math.floor((timeMs / 1000) * fps);
    const speedVal = index < controlTrack.length ? controlTrack[index] : 0;
    const speedPercent = minSpeed + (speedVal * (maxSpeed - minSpeed));

    // Map speed to stroke duration (100% = 150ms, 0% = 2000ms)
    const duration = 150 + ((1 - (speedPercent / 100)) * 1850);

    actions.push({
      at: Math.round(timeMs),
      pos: isUp ? safeMax : safeMin,
    });

    timeMs += duration;
    isUp = !isUp;
  }

  return { actions };
}
