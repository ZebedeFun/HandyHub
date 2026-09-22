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
// Straighten strokes
// ---------------------------------------------------------------------------

// Removes "shoulders": the short, slow leg many scripts put either side of a
// top or bottom (…→ 72, 82, 72 →…), which the Handy plays as a stall before
// each turn. Neither Simplify nor wobble removal touches them — there is no
// reversal, and a shoulder spends so long moving so little that it sits far
// off the straight line. Each rounded turn becomes one point at the extreme,
// timed at the middle of the old rounded section so the turn stays on the beat.
//
// Only points within `size` units of the extreme, and only inside one-way
// runs: the turning points either side are never touched, so small strokes
// and deliberate holds (flat runs) survive.
function straightenPoints(pts, size) {
  if (size <= 0 || pts.length < 3) return pts;
  const t = turningIndices(pts);
  const drop = new Set();
  const moved = new Map(); // index -> new time

  for (let k = 1; k + 1 < t.length; k++) {
    const turn = t[k];
    const ext = pts[turn].pos;
    let first = turn;
    while (first - 1 > t[k - 1] && Math.abs(pts[first - 1].pos - ext) < size) first--;
    let last = turn;
    while (last + 1 < t[k + 1] && Math.abs(pts[last + 1].pos - ext) < size) last++;
    if (first === turn && last === turn) continue;

    for (let i = first; i <= last; i++) if (i !== turn) drop.add(i);
    moved.set(turn, Math.round((pts[first].at + pts[last].at) / 2));
  }

  if (moved.size === 0) return pts;
  return pts
    .map((a, i) => (moved.has(i) ? { at: moved.get(i), pos: a.pos } : a))
    .filter((_, i) => !drop.has(i));
}

/**
 * Turns rounded tops and bottoms into sharp ones (see straightenPoints).
 * @param {number} opts.size - shoulders moving less than this many position
 *   units into or out of a turn are removed.
 */
export const straighten = (actions, range, { size = 12 } = {}) =>
  applyToRange(actions, range, pts => {
    const out = straightenPoints(pts, size);
    return out === pts ? null : out; // null: "nothing to change"
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

// Amplify: make every stroke taller about its OWN centre. Scaling about 50
// shrank strokes that sit off-centre: 5 -> 30 at 200% came out 0 -> 10, the
// bottom pinned at 0 while the top was pulled down towards it. With the centre
// inside the stroke, clipping at 0/100 can cost part of the gain but a stroke
// never comes out shorter than it went in.
//
// A turn's centre is the midpoint of the highest and lowest of it and the
// turns either side — so a hold at the bottom (two turns at the same height)
// still centres between the hold and the peaks. Points between turns take a
// centre interpolated in time.
function amplifyPoints(pts, factor, lock) {
  const t = turningIndices(pts);
  const centre = new Array(pts.length);
  for (let k = 0; k < t.length; k++) {
    const near = [t[k - 1], t[k], t[k + 1]].filter(i => i !== undefined).map(i => pts[i].pos);
    centre[t[k]] = (Math.max(...near) + Math.min(...near)) / 2;
  }
  for (let k = 0; k + 1 < t.length; k++) {
    const a = t[k];
    const b = t[k + 1];
    const span = pts[b].at - pts[a].at;
    for (let i = a + 1; i < b; i++) {
      const f = span > 0 ? (pts[i].at - pts[a].at) / span : 0;
      centre[i] = centre[a] + (centre[b] - centre[a]) * f;
    }
  }
  return pts.map((a, i) => ((i === 0 && lock.first) || (i === pts.length - 1 && lock.last))
    ? a
    : { at: a.at, pos: clampPos(Math.round(centre[i] + (a.pos - centre[i]) * factor)) });
}

/**
 * One click: remove glitches, simplify, remove wobbles, straighten rounded
 * turns, optionally amplify, then (optionally) fit to the Handy.
 * @param {number} opts.wobble - reversals smaller than this are removed (0 = off).
 * @param {number} opts.tolerance - simplify tolerance.
 * @param {number} opts.shoulder - rounded turns under this are straightened (0 = off).
 * @param {number} opts.amplify - stroke height scale, about each stroke's own centre (1 = unchanged).
 * @param {boolean} opts.fitDevice - finish with Fit to Handy.
 */
export const cleanUp = (actions, range, { wobble = 8, tolerance = 3, shoulder = 0, amplify = 1, fitDevice = true, spikeSpeed = DEVICE_MAX_UNITS_PER_SEC * 3 } = {}) =>
  applyToRange(actions, range, (pts, lock) => {
    let p = removeSpikes(pts, spikeSpeed);
    p = simplifyPoints(p, { tolerance });
    if (wobble > 0) p = removeWobbles(p, wobble);
    // After wobbles: a wobble at a peak would otherwise pass for the extreme.
    if (shoulder > 0) p = straightenPoints(p, shoulder);
    if (amplify !== 1) {
      p = amplifyPoints(p, amplify, lock);
      // Amplifying can flatten peaks into plateaus at 0/100; re-simplify.
      p = simplifyPoints(p, { tolerance: 0 });
    }
    if (fitDevice) p = fitToHandyPoints(p, {}, lock);
    return p;
  });

// ---------------------------------------------------------------------------
// Rhythm Repair
// ---------------------------------------------------------------------------
//
// For scripts that found the video's rhythm but lost it here and there — an AI
// tracker missing the odd beat, or going "stubby" (tiny strokes) when it lost
// sight of the motion. Wherever the local rhythm is clear, it:
//   a) fills missing beats: a stroke that lasts ~3, 5, 7... half-strokes
//      instead of one is split into that many strokes;
//   b) rebuilds stubby stretches: a run of strokes far shorter than the local
//      typical height is re-laid as full strokes on the local rhythm.
// Anything longer than the limit is left alone — a long gap or a long quiet
// stretch is more likely a deliberate rest than a tracking failure.

// Direction-change events (real strokes only), each marked top or bottom.
function rhythmEvents(pts) {
  const ev = majorTurningIndices(pts).map(i => ({ i, at: pts[i].at, pos: pts[i].pos }));
  if (ev.length < 2) return ev;
  const firstMove = ev.findIndex((e, k) => k > 0 && e.pos !== ev[k - 1].pos);
  ev[0].top = firstMove > 0 ? ev[firstMove].pos < ev[firstMove - 1].pos : true;
  for (let k = 1; k < ev.length; k++) {
    const d = ev[k].pos - ev[k - 1].pos;
    ev[k].top = d > 0 ? true : d < 0 ? false : ev[k - 1].top;
  }
  return ev;
}

// The rhythm around each stroke, from the strokes within ±window/2 of it:
// half-stroke time H, a full stroke's height, the top/bottom levels, and how
// much of the window actually follows that rhythm (coverage, 0-1).
function localRhythms(strokes, windowMs) {
  const out = new Array(strokes.length).fill(null);
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < strokes.length; k++) {
    const t = strokes[k].mid;
    while (lo < strokes.length && strokes[lo].mid < t - windowMs / 2) lo++;
    while (hi < strokes.length && strokes[hi].mid <= t + windowMs / 2) hi++;
    const win = strokes.slice(lo, hi);
    const amps = win.map(s => s.amp).filter(a => a >= 10).sort((a, b) => a - b);
    if (amps.length < 4) continue;
    // "Full" height = upper quartile, so a stubby stretch cannot drag it down.
    const fullAmp = quantile(amps, 0.75);
    const good = win.filter(s => s.amp >= fullAmp * 0.5);
    if (good.length < 3) continue;
    const durs = good.map(s => s.dur).sort((a, b) => a - b);
    const h0 = median(durs);
    // A rhythm is *consistent* timing. Without this, random motion passed:
    // enough of any jumble lands within a loose band of its own median.
    const spread = (quantile(durs, 0.75) - quantile(durs, 0.25)) / h0;
    if (spread > 0.35) continue;
    const regular = good.filter(s => s.dur >= h0 * 0.7 && s.dur <= h0 * 1.4);
    if (regular.length < 3) continue;
    const H = median(regular.map(s => s.dur));
    const span = win[win.length - 1].end - win[0].start;
    const coverage = span > 0 ? Math.min(1, regular.reduce((sum, s) => sum + s.dur, 0) / span) : 0;
    const tops = regular.map(s => (s.a.top ? s.a.pos : s.b.pos));
    const bottoms = regular.map(s => (s.a.top ? s.b.pos : s.a.pos));
    out[k] = { H, fullAmp, coverage, top: median(tops), bottom: median(bottoms) };
  }
  return out;
}

function strokesFrom(ev) {
  const strokes = [];
  for (let k = 0; k + 1 < ev.length; k++) {
    const a = ev[k];
    const b = ev[k + 1];
    strokes.push({ a, b, amp: Math.abs(b.pos - a.pos), dur: b.at - a.at, start: a.at, end: b.at, mid: (a.at + b.at) / 2 });
  }
  return strokes;
}

// ---- Tempo tracking ----------------------------------------------------------
//
// AI trackers match the on-screen action, but badly: each top and bottom lands
// a little early or late, at a random height, some are missing and some are
// doubled. Measuring how the smoothed motion repeats (autocorrelation) failed
// on exactly that — random heights and jitter weakened the true cycle below
// its multiples. So the tempo is read from the script's own tops and bottoms:
// for each candidate cycle length, how often is a top followed by another top
// one cycle later AND by a bottom half a cycle later (and the same for
// bottoms)? The half-cycle test is what rules out locking on at half speed —
// at double the true length, a top sits where the bottom should be.

function nearestOfKind(events, t, top, tol) {
  // binary search for first event at >= t - tol
  let lo = 0;
  let hi = events.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (events[m].at < t - tol) lo = m + 1; else hi = m; }
  for (let i = lo; i < events.length && events[i].at <= t + tol; i++) if (events[i].top === top) return true;
  return false;
}

/**
 * Tempo over time: for each hop, the full up-and-down cycle length (ms) and a
 * 0-1 confidence (the share of tops/bottoms that fit that cycle).
 */
function trackTempo(pts, { windowSec = 8, hopSec = 1, minCycleMs = 200, maxCycleMs = 3000 } = {}) {
  const ev = rhythmEvents(pts).filter((e, k, all) => k === 0 || Math.abs(e.pos - all[k - 1].pos) >= 1);
  const track = [];
  if (ev.length < 4) return track;
  const t0 = pts[0].at;
  const t1 = pts[pts.length - 1].at;
  const halfWin = (windowSec * 1000) / 2;
  let lo = 0;
  let hi = 0;
  for (let at = t0; at <= t1; at += hopSec * 1000) {
    while (lo < ev.length && ev[lo].at < at - halfWin) lo++;
    while (hi < ev.length && ev[hi].at <= at + halfWin) hi++;
    const win = ev.slice(lo, hi);
    if (win.length < 6) { track.push({ at, cycle: 0, conf: 0 }); continue; }
    // Timing tolerance is fixed, not a share of the cycle: tracker jitter is
    // a few tens of ms whatever the pace, and a tolerance that grew with the
    // cycle let long cycles "fit" busy scripts by pure chance.
    const spanMs = win[win.length - 1].at - win[0].at || 1;
    let best = { cycle: 0, conf: 0 };
    const confAt = new Map();
    for (let cycle = minCycleMs; cycle <= maxCycleMs; cycle += 10) {
      const tol = Math.min(90, cycle * 0.2);
      // Chance that an event of a given kind lands within ±tol at random.
      const chance = 1 - Math.exp(-((win.length / 2) / spanMs) * 2 * tol);
      let hits = 0;
      let tries = 0;
      for (const e of win) {
        // only events whose look-ahead still falls inside the window count
        if (e.at + cycle > at + halfWin) continue;
        tries += 2;
        if (nearestOfKind(ev, e.at + cycle, e.top, tol)) hits++;
        if (nearestOfKind(ev, e.at + cycle / 2, !e.top, tol)) hits++;
      }
      if (tries < 8) continue;
      const conf = Math.max(0, (hits / tries - chance) / (1 - chance));
      confAt.set(cycle, conf);
      // Prefer the shorter cycle on a near-tie: a real beat also "fits" at
      // multiples of itself wherever strokes are missing.
      if (conf > best.conf + 0.02) best = { cycle, conf };
    }
    // Three cycles pass the same test as one (a top again after three, a
    // bottom after one and a half), and jitter decides which scores higher.
    // A motion that repeats every C also repeats every C/2, C/3... only if it
    // really is that fast — so take the shortest fraction (any 1/n) that
    // fits nearly as well. Five cycles fooled a check that stopped at 1/4.
    if (best.cycle) {
      const around = (c) => {
        let m = 0;
        for (let d = -20; d <= 20; d += 10) m = Math.max(m, confAt.get(Math.round((c + d) / 10) * 10) || 0);
        return m;
      };
      for (let div = Math.floor(best.cycle / minCycleMs); div >= 2; div--) {
        const c = best.cycle / div;
        const cf = around(c);
        if (cf >= best.conf * 0.8) { best = { cycle: Math.round(c / 10) * 10, conf: cf }; break; }
      }
    }
    track.push({ at, cycle: best.cycle, conf: best.conf });
  }
  // The pace drifts, it does not jump: smooth over neighbouring hops.
  return track.map((p, i) => {
    const near = track.slice(Math.max(0, i - 2), i + 3).filter(q => q.cycle > 0).map(q => q.cycle);
    return near.length ? { ...p, cycle: median(near) } : p;
  });
}

const tempoAt = (track, t) => {
  if (!track.length) return null;
  const hop = track.length > 1 ? track[1].at - track[0].at : 1000;
  const i = Math.max(0, Math.min(track.length - 1, Math.round((t - track[0].at) / hop)));
  return track[i];
};

/** How rhythmic a script (or range) is: tempo in direction changes per minute
 *  (the unit the Tempo slider uses) and the share of time that follows it. */
export function detectRhythm(actions, range, { minConfidence = 0.6 } = {}) {
  const all = tidy(actions || []);
  const pts = range ? all.filter(a => a.at >= range.startMs && a.at <= range.endMs) : all;
  if (pts.length < 10) return null;
  const track = trackTempo(pts);
  const good = track.filter(p => p.cycle > 0 && p.conf >= minConfidence);
  if (!good.length) return { perMin: 0, share: 0 };
  return { perMin: Math.round(120000 / median(good.map(p => p.cycle))), share: good.length / track.length };
}

/**
 * Rhythm Repair: rebuild rhythmic sections as steady strokes that follow the
 * beat. Steps through each section one half-stroke at a time; where the
 * original has a real top/bottom near where the beat expects one, that point
 * is kept (so the script stays in sync with the video), where it has none a
 * stroke is added, and extra blips in between are dropped. Heights are pulled
 * towards the local full-stroke levels so stubby runs become real strokes.
 * Stretches with no clear rhythm are left exactly as they were.
 *
 * @param {number} opts.evenHeights - 0-1: how far a short stroke is pulled
 *   out to the local top/bottom level (never shrinks a big one).
 * @param {number} opts.minConfidence - 0-1: how clearly the motion must repeat
 *   before a stretch is rebuilt.
 * @param {number} opts.maxGapSec - longest silence/stall to bridge with strokes.
 * @param {boolean} opts.fitDevice - finish with Fit to Handy.
 * @returns {{actions, message}} actions null when nothing was changed.
 */
export function rhythmRepair(actions, range, { evenHeights = 0.75, minConfidence = 0.6, maxGapSec = 4, fitDevice = true } = {}) {
  let rebuiltMs = 0;
  let added = 0;
  let dropped = 0;
  let sections = 0;
  let spanMs = 0;
  const actionsOut = applyToRange(actions, range, (pts, lock) => {
    if (pts.length < 10) return null;
    spanMs = pts[pts.length - 1].at - pts[0].at;
    const track = trackTempo(pts);
    const ev = rhythmEvents(pts);
    if (ev.length < 6) return null;
    const confident = (t) => { const p = tempoAt(track, t); return p && p.cycle > 0 && p.conf >= minConfidence ? p : null; };

    // Local stroke levels: where tops and bottoms usually land nearby.
    const levelsAt = (t) => {
      const near = ev.filter(e => Math.abs(e.at - t) <= 4000);
      const tops = near.filter(e => e.top).map(e => e.pos).sort((a, b) => a - b);
      const bots = near.filter(e => !e.top).map(e => e.pos).sort((a, b) => a - b);
      return {
        top: tops.length ? quantile(tops, 0.85) : 90,
        bottom: bots.length ? quantile(bots, 0.15) : 10,
      };
    };

    // Walk the events; outside sections copy original points, inside rebuild.
    const out = [];
    let lastOutAt = -Infinity;
    let p = 0; // original point cursor
    let e = 0;
    while (e < ev.length) {
      const start = ev[e];
      if (!confident(start.at)) { e++; continue; }

      // Track a section from this event.
      const section = [{ at: start.at, pos: start.pos, top: start.top, snapped: true }];
      let cur = section[0];
      let unsnappedMs = 0;
      let cursor = e + 1;
      for (;;) {
        const tp = confident(cur.at);
        if (!tp) break;
        const half = tp.cycle / 2;
        const expectAt = cur.at + half;
        const wantTop = !cur.top;
        // Candidates: events of the wanted kind within ±35% of a half-stroke.
        let best = null;
        let bestScore = -Infinity;
        while (cursor < ev.length && ev[cursor].at <= cur.at) cursor++;
        for (let c = cursor; c < ev.length && ev[c].at <= expectAt + half * 0.35; c++) {
          const cand = ev[c];
          if (cand.top !== wantTop || cand.at < expectAt - half * 0.35) continue;
          const extremeness = wantTop ? cand.pos : 100 - cand.pos;
          const score = extremeness - (Math.abs(cand.at - expectAt) / half) * 40;
          if (score > bestScore) { bestScore = score; best = { cand, c }; }
        }
        if (expectAt > pts[pts.length - 1].at) break;
        let next;
        if (best) {
          next = { at: best.cand.at, pos: best.cand.pos, top: wantTop, snapped: true };
          unsnappedMs = 0;
          cursor = best.c + 1;
        } else {
          next = { at: Math.round(expectAt), pos: null, top: wantTop, snapped: false };
          unsnappedMs += half;
          if (unsnappedMs > maxGapSec * 1000) break;
        }
        section.push(next);
        cur = next;
      }
      // Trim predicted strokes off the end: a section ends on a real event.
      while (section.length && !section[section.length - 1].snapped) section.pop();
      if (section.length < 5) { e++; continue; }

      // Copy original points before the section, then the section.
      const sStart = section[0].at;
      const sEnd = section[section.length - 1].at;
      while (p < pts.length && pts[p].at < sStart) { if (pts[p].at > lastOutAt) out.push(pts[p]); p++; }
      for (const s of section) {
        const lv = levelsAt(s.at);
        const level = s.top ? lv.top : lv.bottom;
        let pos = s.pos == null ? level : s.pos;
        if (s.pos != null) {
          const short = s.top ? pos < level : pos > level;
          if (short) pos = pos + (level - pos) * evenHeights;
        }
        if (s.pos == null) added++;
        out.push({ at: s.at, pos: clampPos(pos) });
      }
      const before = p;
      while (p < pts.length && pts[p].at <= sEnd) p++;
      dropped += Math.max(0, (p - before) - section.filter(s => s.snapped).length);
      lastOutAt = sEnd;
      rebuiltMs += sEnd - sStart;
      sections++;
      while (e < ev.length && ev[e].at <= sEnd) e++;
    }
    if (!sections) return null;
    while (p < pts.length) { if (pts[p].at > lastOutAt) out.push(pts[p]); p++; }
    // Anchors borrowed from outside a range must come back unchanged.
    if (lock.first) out[0] = pts[0];
    if (lock.last) out[out.length - 1] = pts[pts.length - 1];
    return fitDevice ? fitToHandyPoints(tidy(out), {}, lock) : tidy(out);
  });

  if (actionsOut) {
    const share = spanMs > 0 ? Math.round((100 * rebuiltMs) / spanMs) : 0;
    return {
      actions: actionsOut,
      message: `rebuilt ${sections} rhythmic section${sections === 1 ? '' : 's'} (${share}% of it): ${added} strokes added, ${dropped} stray points dropped`,
    };
  }
  return { actions: null, message: 'No steady rhythm found here — nothing was changed.' };
}
