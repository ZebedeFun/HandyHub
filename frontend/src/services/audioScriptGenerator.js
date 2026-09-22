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

  // 'flowing' re-reads the soundtrack every 50ms, so the pace never settles.
  // 'zoned' reads the soundtrack for a *section's* character, commits to it,
  // and holds it — see generateZonedScript for why.
  // 'patterned' uses the same sections as 'zoned' but plays a repeating stroke
  // pattern in each — see generatePatternedScript.
  structure: 'flowing', // 'flowing' | 'zoned' | 'patterned'
  zoneLengthSec: 16,    // target length of one held section
  rampStrokes: 5,       // full strokes spent gliding between sections
  depthVariation: 60,   // how much stroke depth varies between sections

  // Patterned only.
  patternPick: 'match', // 'match' (pattern suits the section's feel) | 'shuffle'
  patternSeed: 1,       // bump to re-roll which pattern each section gets
  minStrokeLength: 20,  // % of the stroke zone — a pattern's shortest stroke
  maxStrokeLength: 100, // % of the stroke zone — a pattern's longest stroke
};

// Stroke duration in ms for a 0-100 "speed" (100% = 150ms, 0% = 2000ms).
// Shared by both structures so the speed sliders mean the same thing either way.
const halfPeriodForSpeed = (speedPercent) => 150 + ((1 - (speedPercent / 100)) * 1850);

// Both structures obey the same 50%-minimum stroke range.
function safeRange(minHeight, maxHeight) {
  let safeMin = minHeight;
  let safeMax = maxHeight;
  if (safeMax - safeMin < 50) {
    if (safeMin + 50 <= 100) safeMax = safeMin + 50;
    else safeMin = safeMax - 50;
  }
  return [safeMin, safeMax];
}

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

  const merged = { ...DEFAULT_AUDIO_PARAMS, ...params };
  if (merged.structure === 'zoned') return generateZonedScript(envelope, merged, fps);
  if (merged.structure === 'patterned') return generatePatternedScript(envelope, merged, fps);

  const {
    audioType, minHeight, maxHeight, minSpeed, maxSpeed, smoothing, sensitivity,
  } = merged;

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

  const [safeMin, safeMax] = safeRange(minHeight, maxHeight);

  while (timeMs < maxTimeMs) {
    const index = Math.floor((timeMs / 1000) * fps);
    const speedVal = index < controlTrack.length ? controlTrack[index] : 0;
    const speedPercent = minSpeed + (speedVal * (maxSpeed - minSpeed));

    const duration = halfPeriodForSpeed(speedPercent);

    actions.push({
      at: Math.round(timeMs),
      pos: isUp ? safeMax : safeMin,
    });

    timeMs += duration;
    isUp = !isUp;
  }

  return { actions };
}

// ---------------------------------------------------------------------------
// Zoned structure
// ---------------------------------------------------------------------------
//
// Measured against a hand-built beat-matched script (1853 actions over 913s),
// the difference from the 'flowing' generator above is not subtle:
//
//                            reference        flowing (ours)
//   distinct positions            98                2
//   stroke amplitude        21-100 (med 59)    always 100
//   stroke midpoint          18-77             always 50
//   tempo change per stroke  0.0% median       10.6% median
//   strokes changing >25%    0.5%              43%
//   time at a settled tempo  77%               12%
//
// The reference picks a tempo AND a stroke window, holds both dead steady for
// ~16s (41 such sections, one change every ~22s), then glides to the next over
// about 5 strokes. Its section tempos are spread continuously from 166ms to
// 1196ms, so they are not snapped to a beat grid — the music sets each
// section's character, not each individual stroke.
//
// Two further findings shaped the mapping below. Across the reference's
// sections tempo and depth are all but uncorrelated (r = -0.10), so depth
// cannot hang off the same loudness dial as speed — it needs its own signal.
// And our flowing output sits at the 150ms floor for a quarter of its strokes:
// it saturates rather than varies.
//
// So loudness drives tempo, the section's dynamics drive depth, and a slow
// reading of loudness drifts the centre. Everything is derived from the audio,
// nothing is random, so the same video always yields the same script.

// A zone ends when the sound has moved away from what that zone has averaged
// so far, in normalised envelope units.
const ZONE_SPLIT_THRESHOLD = 0.15;

// Box-smooth the envelope so zone decisions follow the shape of a passage
// rather than individual transients.
function smoothLevel(envelope, windowSamples) {
  const half = Math.max(1, Math.floor(windowSamples / 2));
  const width = 2 * half + 1;
  const out = new Array(envelope.length).fill(0);
  let sum = 0;
  for (let i = 0; i < envelope.length + half; i++) {
    if (i < envelope.length) sum += envelope[i];
    if (i >= width) sum -= envelope[i - width];
    const centre = i - half;
    if (centre >= 0 && centre < envelope.length) {
      const lo = Math.max(0, centre - half);
      const hi = Math.min(envelope.length - 1, centre + half);
      out[centre] = sum / (hi - lo + 1);
    }
  }
  return out;
}

// Split the track into sections: a new one starts once the sound has drifted
// from this section's running average, subject to a minimum length, and is
// forced after a maximum so that even a uniform track gets some shape.
function segmentZones(level, fps, targetSec) {
  const minLen = Math.max(1, Math.round(targetSec * 0.5 * fps));
  const maxLen = Math.max(minLen + 1, Math.round(targetSec * 2 * fps));
  const zones = [];
  let start = 0;
  let acc = 0;
  let n = 0;

  for (let i = 0; i < level.length; i++) {
    acc += level[i];
    n++;
    const len = i - start + 1;
    const drifted = len >= minLen && Math.abs(level[i] - acc / n) > ZONE_SPLIT_THRESHOLD;
    if (drifted || len >= maxLen) {
      zones.push([start, i]);
      start = i + 1;
      acc = 0;
      n = 0;
    }
  }

  if (start < level.length) {
    // A stub shorter than the minimum joins the previous section rather than
    // becoming a section of its own.
    if (zones.length > 0 && level.length - start < minLen) zones[zones.length - 1][1] = level.length - 1;
    else zones.push([start, level.length - 1]);
  }
  return zones.length > 0 ? zones : [[0, level.length - 1]];
}

export function generateZonedScript(envelope, params, fps = AUDIO_FPS) {
  const {
    minHeight, maxHeight, minSpeed, maxSpeed, sensitivity,
    zoneLengthSec, rampStrokes, depthVariation,
  } = { ...DEFAULT_AUDIO_PARAMS, ...params };

  if (!envelope || envelope.length === 0) return null;

  const [safeMin, safeMax] = safeRange(minHeight, maxHeight);
  const fullRange = safeMax - safeMin;
  const depth = Math.min(100, Math.max(0, depthVariation)) / 100;

  const level = smoothLevel(envelope, Math.max(2, Math.round(fps)));         // ~1s
  const slowLevel = smoothLevel(envelope, Math.max(4, Math.round(fps * 8))); // ~8s
  const zones = segmentZones(level, fps, Math.max(2, zoneLengthSec));

  // Gather each section's raw character first. Unlike the live flowing
  // generator, zoned mode has the whole track in hand, so it can judge a
  // section against the rest of THIS track rather than against an absolute
  // threshold. That matters: clipping a multiplied level at 1.0 pinned every
  // section of a loud track to the very same maximum speed.
  const sections = zones.map(([a, b]) => {
    let sum = 0;
    let slowSum = 0;
    let peak = 0;
    for (let i = a; i <= b; i++) {
      sum += level[i];
      slowSum += slowLevel[i];
      if (envelope[i] > peak) peak = envelope[i];
    }
    const n = b - a + 1;
    const mean = sum / n;
    return {
      mean,
      slow: slowSum / n,
      // How peaky the section is against its own average: a drone tends to 0,
      // a punchy passage towards 1.
      crest: peak > 0 ? Math.min(1, Math.max(0, (peak - mean) / peak)) : 0,
      endMs: ((b + 1) / fps) * 1000,
    };
  });

  // Spread each measure across the range this track actually uses.
  const spread = (values) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo;
    return (v) => (span > 1e-6 ? (v - lo) / span : 0.5);
  };
  const loudNorm = spread(sections.map(r => r.mean));
  const crestNorm = spread(sections.map(r => r.crest));
  const slowNorm = spread(sections.map(r => r.slow));

  // Sensitivity bends the loudness curve instead of clipping it: above 50 the
  // quieter sections are pulled up towards full speed, below 50 only the
  // loudest sections get there.
  const gamma = Math.pow(10, (50 - sensitivity) / 50);

  const targets = sections.map((r) => {
    const intensity = Math.pow(loudNorm(r.mean), gamma);
    const halfPeriod = halfPeriodForSpeed(minSpeed + intensity * (maxSpeed - minSpeed));

    // Depth rides the section's dynamics, not its loudness.
    const ampFrac = 1 - depth * (1 - crestNorm(r.crest));
    const amp = Math.max(Math.min(fullRange, 20), fullRange * ampFrac);

    // Centre drifts with the slow reading of loudness, kept far enough from the
    // ends that the whole stroke still fits inside the user's zone. The travel
    // available to the centre is the whole of the unused range, not half of it:
    // halving it here pinned the centre to the bottom half of the zone.
    const centre = safeMin + amp / 2 + (fullRange - amp) * slowNorm(r.slow);

    return {
      halfPeriod,
      top: Math.min(safeMax, centre + amp / 2),
      bottom: Math.max(safeMin, centre - amp / 2),
      endMs: r.endMs,
    };
  });

  const actions = [];
  const rampHalfStrokes = Math.max(1, Math.round(rampStrokes) * 2);
  let timeMs = 0;
  let isUp = true;
  let prev = null;

  for (const target of targets) {
    let i = 0;
    while (timeMs < target.endMs) {
      // Glide out of the previous section: tempo geometrically (a constant
      // ratio per stroke, as the reference does), the stroke window linearly.
      const k = prev ? Math.min(1, i / rampHalfStrokes) : 1;
      const halfPeriod = prev
        ? prev.halfPeriod * Math.pow(target.halfPeriod / prev.halfPeriod, k)
        : target.halfPeriod;
      const top = prev ? prev.top + (target.top - prev.top) * k : target.top;
      const bottom = prev ? prev.bottom + (target.bottom - prev.bottom) * k : target.bottom;

      actions.push({
        at: Math.round(timeMs),
        pos: Math.round(isUp ? top : bottom),
      });

      timeMs += halfPeriod;
      isUp = !isUp;
      i++;
    }
    prev = target;
  }

  return actions.length > 0 ? { actions } : null;
}

// ---------------------------------------------------------------------------
// Patterned structure
// ---------------------------------------------------------------------------
//
// Same sections as 'zoned' — a new one starts when the track's intensity
// changes — but instead of one steady stroke per section, each section loops a
// stroke *pattern*: long-long-short-short, tip teasing, flicks and so on. The
// section's loudness still sets the pace; its punchiness picks the pattern.
//
// Speed here is sleeve speed, not stroke duration: the When Quiet/When Loud
// sliders set how long a *full-zone* stroke would take (the same 150ms-2s scale
// as the other structures), and a pattern's short strokes travel at that same
// speed, so they are quicker rather than a crawl.

// One pattern = a list of cycles, each a down-then-up stroke.
//   len    0-1, mapped into the user's Min-Max Length window
//   at     where the stroke sits in the zone: 'top' | 'mid' | 'bottom'
//   down/up speed multipliers for each half (slow pull, fast push...)
// punch 0-1 is how percussive the pattern feels; 'match' pairs it with the
// section's crest (peakiness) so punchy music gets punchy patterns.
const FULL = { len: 1, at: 'mid', down: 1, up: 1 };
const cyc = (len, at = 'mid', down = 1, up = 1) => ({ len, at, down, up });
export const STROKE_PATTERNS = [
  { name: 'Full strokes',          punch: 0.1,  cycles: [FULL] },
  { name: 'Slow pull, fast push',  punch: 0.3,  cycles: [cyc(1, 'mid', 0.6, 1.5)] },
  { name: 'Build-up',              punch: 0.35, cycles: [cyc(0.25), cyc(0.5), cyc(0.75), FULL] },
  { name: 'Tip teasing',           punch: 0.45, cycles: [cyc(0.2, 'top'), cyc(0.2, 'top'), cyc(0.2, 'top'), FULL] },
  { name: 'Base grind',            punch: 0.5,  cycles: [cyc(0.2, 'bottom'), cyc(0.2, 'bottom'), cyc(0.2, 'bottom'), FULL] },
  { name: 'Long-long-short-short', punch: 0.6,  cycles: [FULL, FULL, cyc(0.3, 'top'), cyc(0.3, 'top')] },
  { name: 'Double tap',            punch: 0.8,  cycles: [FULL, cyc(0.3, 'bottom', 1.2, 1.2), cyc(0.3, 'bottom', 1.2, 1.2)] },
  { name: 'Flicks',                punch: 0.95, cycles: [cyc(0.15, 'top', 1.2, 1.2)] },
];

// Fastest the generator will ask for: 5 full cycles a second, as the procedural
// generator enforces.
const PATTERN_MIN_GAP_MS = 100;

// Small seeded PRNG so a given seed always yields the same script — retuning a
// slider should not also re-roll every pattern.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPattern(rand, crest, pick, prevIndex) {
  const weights = STROKE_PATTERNS.map((p, i) => {
    if (i === prevIndex) return 0; // never the same pattern twice running
    if (pick === 'shuffle') return 1;
    return Math.exp(-((p.punch - crest) ** 2) / 0.06);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return i;
  }
  return weights.findIndex(w => w > 0);
}

export function generatePatternedScript(envelope, params, fps = AUDIO_FPS) {
  const {
    minHeight, maxHeight, minSpeed, maxSpeed, sensitivity,
    zoneLengthSec, rampStrokes, patternPick, patternSeed,
    minStrokeLength, maxStrokeLength,
  } = { ...DEFAULT_AUDIO_PARAMS, ...params };

  if (!envelope || envelope.length === 0) return null;

  const [safeMin, safeMax] = safeRange(minHeight, maxHeight);
  const fullRange = safeMax - safeMin;
  const lenLo = Math.min(minStrokeLength, maxStrokeLength) / 100;
  const lenHi = Math.max(minStrokeLength, maxStrokeLength) / 100;

  const level = smoothLevel(envelope, Math.max(2, Math.round(fps)));
  const zones = segmentZones(level, fps, Math.max(2, zoneLengthSec));

  const sections = zones.map(([a, b]) => {
    let sum = 0;
    let peak = 0;
    for (let i = a; i <= b; i++) {
      sum += level[i];
      if (envelope[i] > peak) peak = envelope[i];
    }
    const mean = sum / (b - a + 1);
    return {
      mean,
      crest: peak > 0 ? Math.min(1, Math.max(0, (peak - mean) / peak)) : 0,
      endMs: ((b + 1) / fps) * 1000,
    };
  });

  const spread = (values) => {
    const lo = Math.min(...values);
    const span = Math.max(...values) - lo;
    return (v) => (span > 1e-6 ? (v - lo) / span : 0.5);
  };
  const loudNorm = spread(sections.map(r => r.mean));
  const crestNorm = spread(sections.map(r => r.crest));
  const gamma = Math.pow(10, (50 - sensitivity) / 50);

  const rand = mulberry32(patternSeed * 2654435761 + envelope.length);
  let prevIndex = -1;
  const plan = sections.map((r) => {
    const intensity = Math.pow(loudNorm(r.mean), gamma);
    // Sleeve speed in position-units per ms, from the full-stroke duration.
    const speed = fullRange / halfPeriodForSpeed(minSpeed + intensity * (maxSpeed - minSpeed));
    const patternIndex = pickPattern(rand, crestNorm(r.crest), patternPick, prevIndex);
    prevIndex = patternIndex;
    return { speed, pattern: STROKE_PATTERNS[patternIndex], endMs: r.endMs };
  });

  // A cycle's stroke window. 'top' and 'bottom' anchor to the ends of a
  // Max-Length-sized span centred in the zone, not to the zone itself — so
  // even the move between a top-anchored stroke and a bottom-anchored one is
  // never longer than Max Length.
  const mid = safeMin + fullRange / 2;
  const reachHi = mid + (fullRange * lenHi) / 2;
  const reachLo = mid - (fullRange * lenHi) / 2;
  const minMove = fullRange * lenLo;
  const windowFor = (c) => {
    const amp = fullRange * (lenLo + (lenHi - lenLo) * c.len);
    if (c.at === 'top') return [reachHi - amp, reachHi];
    if (c.at === 'bottom') return [reachLo, reachLo + amp];
    return [mid - amp / 2, mid + amp / 2];
  };

  // Points in order; each move's time comes from its distance and speed. A
  // point that carries on in the same direction as the last move (a top-
  // anchored stroke after a bottom-anchored one) merges into it.
  const points = [{ at: 0, pos: Math.round(reachHi) }];
  const pushPoint = (pos, speedPerMs) => {
    pos = Math.round(Math.max(safeMin, Math.min(safeMax, pos)));
    let last = points[points.length - 1];
    const before = points[points.length - 2];
    if (before && Math.sign(pos - last.pos) === Math.sign(last.pos - before.pos)) {
      points.pop();
      last = before;
    }
    if (pos === last.pos) return;
    // Where two differently placed strokes meet, the hand-over can be a tiny
    // reversal (up to 36, back down to 30, up to 70). Skip it; the next point
    // then merges and the move simply carries on through.
    if (before && Math.sign(pos - last.pos) !== Math.sign(last.pos - before.pos)
        && Math.abs(pos - last.pos) < minMove - 1) return;
    const gap = Math.max(PATTERN_MIN_GAP_MS, Math.abs(pos - last.pos) / speedPerMs);
    points.push({ at: last.at + gap, pos });
  };

  const rampCycles = Math.max(1, Math.round(rampStrokes));
  const totalMs = (envelope.length / fps) * 1000;
  let prevSpeed = null;
  for (const section of plan) {
    let n = 0;
    while (points[points.length - 1].at < section.endMs) {
      // Glide the pace geometrically out of the previous section; the pattern
      // itself switches at the boundary, which is the point of the structure.
      const k = prevSpeed ? Math.min(1, n / rampCycles) : 1;
      const speed = prevSpeed ? prevSpeed * Math.pow(section.speed / prevSpeed, k) : section.speed;
      const c = section.pattern.cycles[n % section.pattern.cycles.length];
      const [bottom, top] = windowFor(c);
      const lastAt = points[points.length - 1].at;
      pushPoint(bottom, speed * c.down);
      pushPoint(top, speed * c.up);
      n++;
      // A cycle that added no time (it merged away entirely) must not stall.
      if (points[points.length - 1].at <= lastAt && n > section.pattern.cycles.length) break;
    }
    prevSpeed = section.speed;
  }

  const actions = points
    .filter(p => p.at <= totalMs)
    .map(p => ({ at: Math.round(p.at), pos: p.pos }));
  return actions.length > 1 ? { actions, sections: plan.map(p => ({ endMs: p.endMs, pattern: p.pattern.name })) } : null;
}
