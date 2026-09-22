// Script Toolbox: repairs for any funscript, whether it was made here or
// loaded from elsewhere (AI generators, other scripters).
//
// Every tool is a pure function of an actions array. Each can run on the whole
// script or on a time range; for a range, the point either side of it is
// passed in as a fixed anchor, so the edit joins the untouched script without
// a step — anchors are never moved or removed.
//
// Written for HandyTime from general techniques (line simplification, speed
// clamping, rescaling, detrending). The reference stroke-height curve is Joe's
// own measurement of hand-made scripts.

import { DEVICE_MAX_UNITS_PER_SEC } from './handyService';
import { MIN_GAP_MS } from './scriptGenerator';

// A segment the Handy cannot perform at full slide range: too steep, or two
// points closer together than it can reverse between. Shared with the timeline,
// which paints these red, so "Fit to Handy" clears exactly what is marked.
export const overDeviceLimit = (a, b) => {
  const deltaMs = b.at - a.at;
  if (deltaMs <= 0) return true;
  if (deltaMs < MIN_GAP_MS) return true;
  return Math.abs(b.pos - a.pos) / (deltaMs / 1000) > DEVICE_MAX_UNITS_PER_SEC;
};

export { DEVICE_MAX_UNITS_PER_SEC };

const clampPos = (p) => Math.max(0, Math.min(100, p));

// Sorted, integer, 0-100, one point per millisecond. Loaded scripts are not
// always any of those.
function tidy(actions) {
  const sorted = actions
    .map(a => ({ at: Math.round(a.at), pos: Math.round(clampPos(a.pos)) }))
    .sort((a, b) => a.at - b.at);
  const out = [];
  for (const a of sorted) {
    if (out.length && out[out.length - 1].at === a.at) out[out.length - 1] = a;
    else out.push(a);
  }
  return out;
}

// Indices where the direction of travel changes, plus both ends. A flat run
// counts as its own direction, so both edges of a plateau are kept.
export function turningIndices(pts) {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);
  const out = [0];
  let prevDir = Math.sign(pts[1].pos - pts[0].pos);
  for (let i = 1; i < n - 1; i++) {
    const dir = Math.sign(pts[i + 1].pos - pts[i].pos);
    if (dir !== prevDir) out.push(i);
    prevDir = dir;
  }
  out.push(n - 1);
  return out;
}

// A reversal smaller than this, inside a larger move, is jitter rather than a
// stroke. Used wherever "the strokes" have to be found in a noisy script.
const WOBBLE_UNITS = 5;

// The turning points that are real strokes: small back-and-forth wobbles that
// sit *inside* a larger move are skipped (10 -> 60, dip to 55, on to 90 is one
// stroke, 10 -> 90). A small reversal at the very top of a stroke (90, dip to
// 85, back to 88) is skipped in favour of the higher peak, because only a
// wobble contained by its neighbours counts as one.
export function majorTurningIndices(pts, size = WOBBLE_UNITS) {
  let t = turningIndices(pts);
  for (let pass = 0; pass < 20; pass++) {
    const next = [];
    let changed = false;
    for (let k = 0; k < t.length; k++) {
      if (k >= 1 && k + 2 < t.length) {
        const pa = pts[next[next.length - 1]].pos;
        const pb = pts[t[k]].pos;
        const pc = pts[t[k + 1]].pos;
        const pd = pts[t[k + 2]].pos;
        const up = pb > pa;
        const contained = up ? (pd >= pb && pa <= pc) : (pd <= pb && pa >= pc);
        if (Math.abs(pb - pc) < size && contained) { k += 1; changed = true; continue; }
      }
      next.push(t[k]);
    }
    t = next;
    if (!changed) break;
  }
  return t;
}

// Stroke heights: travel between consecutive real turning points.
function strokeHeights(pts) {
  const t = majorTurningIndices(pts);
  const h = [];
  for (let k = 0; k + 1 < t.length; k++) h.push(Math.abs(pts[t[k + 1]].pos - pts[t[k]].pos));
  return h;
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Run `fn` over the whole script, or only over `range` ({startMs, endMs}).
 * `fn(points, lock)` gets copies it may mutate and returns the new points; with
 * a range, `lock.first`/`lock.last` mark anchors borrowed from outside it,
 * which must come back first/last and unchanged. Returns null if `fn` does.
 */
function applyToRange(actions, range, fn) {
  const pts = tidy(actions || []);
  if (pts.length < 2) return null;
  if (!range) {
    const out = fn(pts.map(a => ({ ...a })), { first: false, last: false });
    return out ? tidy(out) : null;
  }
  const i0 = pts.findIndex(a => a.at >= range.startMs);
  let i1 = -1;
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].at <= range.endMs) { i1 = i; break; }
  if (i0 === -1 || i1 < i0) return null;
  const lo = Math.max(0, i0 - 1);
  const hi = Math.min(pts.length - 1, i1 + 1);
  const seg = pts.slice(lo, hi + 1).map(a => ({ ...a }));
  const out = fn(seg, { first: lo < i0, last: hi > i1 });
  if (!out) return null;
  return tidy([...pts.slice(0, lo), ...out, ...pts.slice(hi + 1)]);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Summary of a script (or of the part inside `range`), for before/after. */
export function scriptStats(actions, range) {
  const all = tidy(actions || []);
  const pts = range ? all.filter(a => a.at >= range.startMs && a.at <= range.endMs) : all;
  if (pts.length < 2) return { points: pts.length, strokes: 0, medianHeight: 0, topSpeed: 0, tooFast: 0, perSec: 0 };
  let topSpeed = 0;
  let tooFast = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].at - pts[i - 1].at;
    if (dt > 0) topSpeed = Math.max(topSpeed, Math.abs(pts[i].pos - pts[i - 1].pos) / (dt / 1000));
    if (overDeviceLimit(pts[i - 1], pts[i])) tooFast++;
  }
  const heights = strokeHeights(pts);
  const spanSec = (pts[pts.length - 1].at - pts[0].at) / 1000;
  return {
    points: pts.length,
    strokes: heights.length,
    medianHeight: Math.round(median(heights.filter(h => h >= 3))),
    topSpeed: Math.round(topSpeed),
    tooFast,
    perSec: spanSec > 0 ? +(pts.length / spanSec).toFixed(1) : 0,
  };
}

// ---------------------------------------------------------------------------
// Simplify
// ---------------------------------------------------------------------------

// Line simplification over one run of points: drop any point that sits within
// `tol` position units of the straight line its neighbours would draw anyway.
function simplifyRun(run, tol) {
  if (run.length <= 2) return run;
  const keep = new Array(run.length).fill(false);
  keep[0] = keep[run.length - 1] = true;
  const stack = [[0, run.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = run[a];
    const B = run[b];
    const dt = B.at - A.at;
    let worst = -1;
    let worstDist = tol;
    for (let i = a + 1; i < b; i++) {
      const expected = dt > 0 ? A.pos + ((run[i].at - A.at) / dt) * (B.pos - A.pos) : A.pos;
      const dist = Math.abs(run[i].pos - expected);
      if (dist > worstDist) { worstDist = dist; worst = i; }
    }
    if (worst > 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return run.filter((_, i) => keep[i]);
}

/**
 * Keeps every direction change and drops the points in between that only
 * restate the line the device would draw anyway. AI-made scripts often carry
 * ~30 points a second; most of them are this.
 * @param {number} opts.tolerance - how far (position units) a point may sit off
 *   the line and still be dropped. 0 drops only exact in-line points.
 */
export function simplifyPoints(pts, { tolerance = 3 } = {}) {
  const t = turningIndices(pts);
  const out = [pts[0]];
  for (let k = 0; k + 1 < t.length; k++) {
    const run = simplifyRun(pts.slice(t[k], t[k + 1] + 1), Math.max(0, tolerance));
    out.push(...run.slice(1));
  }
  return out;
}

export const simplify = (actions, range, opts) =>
  applyToRange(actions, range, pts => simplifyPoints(pts, opts));

// ---------------------------------------------------------------------------
// Fit to Handy
// ---------------------------------------------------------------------------

/**
 * Makes a script something the Handy can actually perform: no two points
 * closer than `minGapMs`, no segment faster than `maxSpeed`. Timing is kept;
 * an over-fast stroke is made shorter, not slower.
 * @param {number} opts.maxSpeed - position units per second.
 * @param {number} opts.minGapMs - closest two points may sit.
 * @param {'both'|'top'|'bottom'} opts.trim - which end of an over-fast stroke
 *   gives way. 'top' keeps depth (lowers peaks), 'bottom' keeps the tip
 *   strokes (raises valleys), 'both' shortens whichever end comes second.
 */
export function fitToHandyPoints(pts, { maxSpeed = DEVICE_MAX_UNITS_PER_SEC, minGapMs = MIN_GAP_MS, trim = 'both' } = {}, lock = {}) {
  let n = pts.length;
  if (n < 2) return pts;

  // 1. Points too close together. Of each clashing pair keep the one that
  //    matters: an anchor, then an end of the script, then a direction change.
  const turning = new Set(turningIndices(pts));
  const keep = [0];
  for (let i = 1; i < n; i++) {
    const last = keep[keep.length - 1];
    if (pts[i].at - pts[last].at >= minGapMs) { keep.push(i); continue; }
    const iIsEnd = i === n - 1;
    if (last === 0) { if (iIsEnd) keep.push(i); continue; }
    if (iIsEnd || (turning.has(i) && !turning.has(last))) keep[keep.length - 1] = i;
  }
  const p = keep.map(i => ({ ...pts[i] }));
  n = p.length;
  const fixed = (i) => (i === 0 && lock.first) || (i === n - 1 && lock.last);

  // 2. Speed. Directional passes first, as asked; then a forward pass that
  //    always converges, and a backward one in case the last point is anchored.
  const allowed = (a, b) => Math.floor(maxSpeed * (b.at - a.at) / 1000);
  const tooFast = (a, b) => Math.abs(b.pos - a.pos) > allowed(a, b);

  if (trim !== 'both') {
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let i = 1; i < n; i++) {
        const a = p[i - 1];
        const b = p[i];
        if (!tooFast(a, b)) continue;
        const lim = allowed(a, b);
        let moveA = trim === 'top' ? a.pos > b.pos : a.pos < b.pos;
        if (moveA && fixed(i - 1)) moveA = false;
        if (!moveA && fixed(i)) moveA = true;
        if (fixed(i - 1) && fixed(i)) continue;
        if (moveA) a.pos = b.pos + (a.pos > b.pos ? lim : -lim);
        else b.pos = a.pos + (b.pos > a.pos ? lim : -lim);
        changed = true;
      }
      if (!changed) break;
    }
  }
  for (let i = 1; i < n; i++) {
    if (!tooFast(p[i - 1], p[i])) continue;
    if (!fixed(i)) {
      const lim = allowed(p[i - 1], p[i]);
      p[i].pos = p[i - 1].pos + (p[i].pos > p[i - 1].pos ? lim : -lim);
    } else {
      for (let j = i; j >= 1 && tooFast(p[j - 1], p[j]) && !fixed(j - 1); j--) {
        const lim = allowed(p[j - 1], p[j]);
        p[j - 1].pos = p[j].pos + (p[j - 1].pos > p[j].pos ? lim : -lim);
      }
    }
  }
  return p;
}

export const fitToHandy = (actions, range, opts) =>
  applyToRange(actions, range, (pts, lock) => fitToHandyPoints(pts, opts, lock));

// ---------------------------------------------------------------------------
// Fit to Range
// ---------------------------------------------------------------------------

/** Linearly rescales positions so the lowest becomes `min` and the highest `max`. */
export const fitToRange = (actions, range, { min = 0, max = 100 } = {}) =>
  applyToRange(actions, range, (pts, lock) => {
    const inner = pts.filter((_, i) => !((i === 0 && lock.first) || (i === pts.length - 1 && lock.last)));
    if (inner.length < 2) return null;
    const lo = Math.min(...inner.map(a => a.pos));
    const hi = Math.max(...inner.map(a => a.pos));
    if (hi - lo < 1) return null;
    const [tLo, tHi] = [Math.min(min, max), Math.max(min, max)];
    return pts.map((a, i) => {
      if ((i === 0 && lock.first) || (i === pts.length - 1 && lock.last)) return a;
      return { at: a.at, pos: tLo + ((a.pos - lo) / (hi - lo)) * (tHi - tLo) };
    });
  });

// ---------------------------------------------------------------------------
// Stroke Height Match
// ---------------------------------------------------------------------------

// Joe's measurement of hand-made scripts: stroke height at each 5% quantile,
// as a multiple of the median. Mapping a script's own height distribution onto
// this lifts timid strokes to a human size while keeping big strokes as rare as
// they are in real scripts — a plain gain instead pins everything to 0 and 100.
const REFERENCE_HEIGHT_SHAPE = [
  0.0133, 0.2800, 0.4267, 0.6267, 0.7467, 0.8133, 0.8667, 0.9067,
  0.9467, 0.9733, 1.0000, 1.0267, 1.0533, 1.0800, 1.0933, 1.1200,
  1.1467, 1.1733, 1.2000, 1.2400, 1.3200,
];

const quantile = (sorted, q) => {
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const interpMonotone = (x, xs, ys) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const span = xs[i] - xs[i - 1];
      return span > 0 ? ys[i - 1] + ((x - xs[i - 1]) / span) * (ys[i] - ys[i - 1]) : ys[i];
    }
  }
  return ys[ys.length - 1];
};

/**
 * Resizes strokes so their heights follow the hand-made distribution with the
 * given median. Timing and point count are untouched. Needs at least 8 real
 * strokes to learn the script's own distribution from; returns null otherwise.
 * @param {number} opts.targetMedian - typical stroke height to aim for (0-100).
 * @param {number} opts.strength - 0-1, how far to move towards the target.
 */
export const strokeHeightMatch = (actions, range, { targetMedian = 75, strength = 1, maxGain = 4 } = {}) =>
  applyToRange(actions, range, (pts, lock) => {
    // Resize real strokes only; jitter rides along inside the stroke it sits in.
    const t = majorTurningIndices(pts);
    const h = [];
    for (let k = 0; k + 1 < t.length; k++) h.push(Math.abs(pts[t[k + 1]].pos - pts[t[k]].pos));
    const usable = h.filter(x => x >= 3).sort((a, b) => a - b);
    if (usable.length < 8) return null;

    const qs = REFERENCE_HEIGHT_SHAPE.map((_, i) => i / (REFERENCE_HEIGHT_SHAPE.length - 1));
    const src = [];
    const dst = [];
    qs.forEach((q, i) => {
      src.push(Math.max(src.length ? src[src.length - 1] : 0, quantile(usable, q)));
      dst.push(Math.max(dst.length ? dst[dst.length - 1] : 0, REFERENCE_HEIGHT_SHAPE[i] * targetMedian));
    });

    const gains = h.map(height => {
      if (height < 3) return 1;
      let want = Math.min(interpMonotone(height, src, dst), height * maxGain, 100);
      want = height + (want - height) * Math.max(0, Math.min(1, strength));
      return want / height;
    });

    // Each turning point moves away from its local midline by the average gain
    // of the two strokes it joins, so neighbouring strokes agree on it.
    const oldPos = pts.map(a => a.pos);
    const newAt = new Map();
    t.forEach((idx, k) => {
      if ((idx === 0 && lock.first) || (idx === pts.length - 1 && lock.last)) { newAt.set(idx, oldPos[idx]); return; }
      const nb = [];
      const g = [];
      if (k > 0) { nb.push(oldPos[t[k - 1]]); g.push(gains[k - 1]); }
      if (k + 1 < t.length) { nb.push(oldPos[t[k + 1]]); g.push(gains[k]); }
      const centre = (oldPos[idx] + nb.reduce((s, x) => s + x, 0) / nb.length) / 2;
      const gain = g.reduce((s, x) => s + x, 0) / g.length;
      newAt.set(idx, clampPos(centre + (oldPos[idx] - centre) * gain));
    });

    // Points between turning points keep their place along the stroke (jitter
    // included — it can sit slightly outside 0-1, and scales with the stroke).
    for (let k = 0; k + 1 < t.length; k++) {
      const a = t[k];
      const b = t[k + 1];
      const oa = oldPos[a];
      const ob = oldPos[b];
      const na = newAt.get(a);
      const nbPos = newAt.get(b);
      pts[a].pos = na;
      pts[b].pos = nbPos;
      for (let i = a + 1; i < b; i++) {
        const frac = ob !== oa ? (oldPos[i] - oa) / (ob - oa) : 0;
        pts[i].pos = clampPos(na + frac * (nbPos - na));
      }
    }
    return pts;
  });

// ---------------------------------------------------------------------------
// Drift Fix
// ---------------------------------------------------------------------------

/**
 * Removes slow wander of the whole stroke band — the creep up or down that
 * camera-tracked scripts pick up when the camera moves. Each point is shifted
 * by how far the local stroke midline (the median over `windowSec`) sits from
 * the section's overall midline. Stroke heights are kept. At an anchored edge
 * the correction fades in over a second so the join does not jump.
 */
export const driftFix = (actions, range, { windowSec = 8 } = {}) =>
  applyToRange(actions, range, (pts, lock) => {
    const t = majorTurningIndices(pts);
    if (t.length < 5) return null;
    const mids = [];
    for (let k = 0; k + 1 < t.length; k++) {
      const a = pts[t[k]];
      const b = pts[t[k + 1]];
      mids.push({ at: (a.at + b.at) / 2, pos: (a.pos + b.pos) / 2 });
    }
    const target = median(mids.map(m => m.pos));
    const half = (windowSec * 1000) / 2;
    const firstAt = pts[0].at;
    const lastAt = pts[pts.length - 1].at;
    const FADE_MS = 1000;

    let lo = 0;
    let hi = 0;
    return pts.map((a, i) => {
      if ((i === 0 && lock.first) || (i === pts.length - 1 && lock.last)) return a;
      while (lo < mids.length && mids[lo].at < a.at - half) lo++;
      while (hi < mids.length && mids[hi].at <= a.at + half) hi++;
      const local = hi > lo ? median(mids.slice(lo, hi).map(m => m.pos)) : target;
      let weight = 1;
      if (lock.first) weight = Math.min(weight, (a.at - firstAt) / FADE_MS);
      if (lock.last) weight = Math.min(weight, (lastAt - a.at) / FADE_MS);
      weight = Math.max(0, Math.min(1, weight));
      return { at: a.at, pos: clampPos(a.pos + (target - local) * weight) };
    });
  });

// ---------------------------------------------------------------------------
// Clean Up — the one-click chain
// ---------------------------------------------------------------------------

// Drop glitches: a lone point that is reached and left faster than anything
// the device (or a person) could mean — a tracker spike.
function removeSpikes(pts, spikeSpeed) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const vIn = Math.abs(cur.pos - prev.pos) / Math.max(1, cur.at - prev.at) * 1000;
    const vOut = Math.abs(next.pos - cur.pos) / Math.max(1, next.at - cur.at) * 1000;
    const reverses = Math.sign(cur.pos - prev.pos) * Math.sign(next.pos - cur.pos) < 0;
    if (reverses && vIn > spikeSpeed && vOut > spikeSpeed) continue;
    out.push(cur);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Remove wobbles: keep only the real turning points' runs, dropping every
// point that belonged to a skipped wobble (see majorTurningIndices).
function removeWobbles(pts, size) {
  const major = majorTurningIndices(pts, size);
  const keep = new Set(major);
  // Points between two consecutive real turning points survive only if the
  // stretch between them holds no skipped turning point, i.e. was already a
  // clean one-way run.
  const all = turningIndices(pts);
  const skipped = new Set(all.filter(i => !keep.has(i)));
  for (let k = 0; k + 1 < major.length; k++) {
    let clean = true;
    for (let i = major[k] + 1; i < major[k + 1]; i++) if (skipped.has(i)) { clean = false; break; }
    if (clean) for (let i = major[k] + 1; i < major[k + 1]; i++) keep.add(i);
  }
  return pts.filter((_, i) => keep.has(i));
}

/**
 * One click: remove glitches, simplify, remove wobbles, optionally amplify,
 * then (optionally) fit to the Handy.
 * @param {number} opts.wobble - reversals smaller than this are removed (0 = off).
 * @param {number} opts.tolerance - simplify tolerance.
 * @param {number} opts.amplify - scale about 50 (1 = unchanged).
 * @param {boolean} opts.fitDevice - finish with Fit to Handy.
 */
export const cleanUp = (actions, range, { wobble = 8, tolerance = 3, amplify = 1, fitDevice = true, spikeSpeed = DEVICE_MAX_UNITS_PER_SEC * 3 } = {}) =>
  applyToRange(actions, range, (pts, lock) => {
    let p = removeSpikes(pts, spikeSpeed);
    p = simplifyPoints(p, { tolerance });
    if (wobble > 0) p = removeWobbles(p, wobble);
    if (amplify !== 1) {
      p = p.map((a, i) => ((i === 0 && lock.first) || (i === p.length - 1 && lock.last))
        ? a
        : { at: a.at, pos: clampPos(50 + (a.pos - 50) * amplify) });
      // Amplifying can flatten peaks into plateaus at 0/100; re-simplify.
      p = simplifyPoints(p, { tolerance: 0 });
    }
    if (fitDevice) p = fitToHandyPoints(p, {}, lock);
    return p;
  });
