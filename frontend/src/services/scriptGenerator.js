// A Handy cannot sustain more than roughly 5 full up-down cycles per second.
// One cycle is two actions, so this is the hard floor on the gap between them.
// Without it, short strokes (a narrow depth zone, or a low Max Length) used to
// produce 10+ cycles/sec — scripts the hardware simply smears through.
export const MAX_CYCLES_PER_SEC = 5;
const MIN_GAP_MS = 1000 / (MAX_CYCLES_PER_SEC * 2);
const MAX_GAP_MS = 4000;

// Linear carriage speed ceiling in position-units per second, indexed by the
// baseSpeed slider (1-10). This is the device limit, and it is now only a
// *cap* — tempo is set independently by strokesPerMin.
const MIN_LINEAR_SPEED = 40;
const MAX_LINEAR_SPEED = 400;

/**
 * Generates a procedural funscript based on parameters.
 * @param {number} durationMs - The duration of the video in milliseconds.
 * @param {object} params - The generation parameters.
 * @param {number} params.strokesPerMin - Tempo: direction changes per minute. Sets the rhythm.
 * @param {number} params.baseSpeed - Linear speed cap (1 to 10). Limits how fast long strokes may travel.
 * @param {number} params.randomness - Randomness factor (0 to 10), higher means less steady rhythm.
 * @param {number} params.minStroke - Minimum position (0 to 100).
 * @param {number} params.maxStroke - Maximum position (0 to 100).
 * @returns {object} - The funscript object `{ actions: [{at, pos}], metadata }`
 */
export function generateProceduralScript(durationMs, params) {
  const {
    baseSpeed = 5,
    strokesPerMin = 200,
    randomness = 5,
    minStroke = 0,
    maxStroke = 100,
    minStrokeLength = 10,
    maxStrokeLength = 100,
    patternMode = 'consistent',
    blockSizeSec = 0,
    transitionSec = 0,
    cooldownSec = 0,
    startPos
  } = params;

  const actions = [];
  let currentTime = 0;
  
  // Start at a default position, or startPos if provided
  let currentPos = startPos !== undefined ? startPos : Math.floor((minStroke + maxStroke) / 2);
  actions.push({ at: 0, pos: currentPos });

  // State for direction and blocks
  let movingUp = true;
  let blockEndTime = 0;
  let blockGap = 0;
  
  // State for the current block's target parameters
  let targetBlockMovementSize = 0;
  let targetBlockSpeedVals = 0;
  let targetBlockCenter = 0;
  let targetBlockTempo = 0;

  let prevBlockMovementSize = 0;
  let prevBlockSpeedVals = 0;
  let prevBlockCenter = 0;
  let prevBlockTempo = 0;
  let blockStartTime = 0;

  while (currentTime < durationMs) {
    const timeRemainingMs = durationMs - currentTime;
    const inCooldown = cooldownSec > 0 && timeRemainingMs <= cooldownSec * 1000;
    const range = maxStroke - minStroke;

    // Pick new stroke parameters if we are past the current block's duration
    if (currentTime >= blockEndTime) {

      prevBlockMovementSize = targetBlockMovementSize;
      prevBlockSpeedVals = targetBlockSpeedVals;
      prevBlockCenter = targetBlockCenter || (minStroke + range / 2);
      prevBlockTempo = targetBlockTempo;
      blockStartTime = currentTime;

      let currentBlockSpeed = baseSpeed;
      let currentBlockLengthPct = maxStrokeLength;
      // Tempo multiplier for this block. Only the cooldown moves it off 1.
      let currentTempoScale = 1;

      // Determine base parameters for THIS block
      if (inCooldown) {
         // Wind down progressively rather than stepping to a fixed setting.
         // Both the amplitude AND the tempo have to fall: dropping amplitude
         // alone leaves the stroke rate unchanged (shorter strokes at the same
         // linear speed take the same time), which read as a shallow flutter
         // rather than the slow finish the control promises.
         const cooldownMs = cooldownSec * 1000;
         const progress = Math.min(1, Math.max(0, 1 - (timeRemainingMs / cooldownMs)));
         // Ease down from the middle of the active length window, not from
         // maxStrokeLength — starting at the maximum makes the first half of the
         // cooldown *longer* than the strokes it is supposed to be winding down from.
         const activeLengthPct = (minStrokeLength + maxStrokeLength) / 2;
         currentBlockSpeed = baseSpeed + (1 - baseSpeed) * progress;
         currentBlockLengthPct = activeLengthPct + (10 - activeLengthPct) * progress;
         currentTempoScale = 1 - 0.75 * progress; // ease down to a quarter tempo
      } else if (patternMode === 'build') {
         const activeDuration = cooldownSec > 0 ? durationMs - (cooldownSec * 1000) : durationMs;
         const progress = activeDuration > 0 ? Math.min(1, currentTime / activeDuration) : 1;
         currentBlockSpeed = 1 + (baseSpeed - 1) * progress;
         currentBlockLengthPct = minStrokeLength + (maxStrokeLength - minStrokeLength) * progress;
      } else if (patternMode === 'random') {
         // Random Phases: Pick a completely random speed and length within user bounds for this block
         currentBlockSpeed = 1 + (Math.random() * (baseSpeed - 1));
         const lengthRange = maxStrokeLength - minStrokeLength;
         currentBlockLengthPct = minStrokeLength + (Math.random() * lengthRange);
      } else {
         // Consistent mode: Use baseSpeed, but pick a random length within bounds for variety
         currentBlockSpeed = baseSpeed;
         const lengthRange = maxStrokeLength - minStrokeLength;
         currentBlockLengthPct = minStrokeLength + (Math.random() * lengthRange);
      }
      
      // 1. Pick a target movement size based on the chosen block length
      const baseMovement = range * (currentBlockLengthPct / 100);
      const randFactorPos = (Math.random() * 2 - 1) * (randomness / 10) * 0.2;
      targetBlockMovementSize = Math.max(0, Math.min(range, baseMovement + (range * randFactorPos)));

      // 2. Pick a Target Center (depth)
      const minPossibleCenter = minStroke + (targetBlockMovementSize / 2);
      const maxPossibleCenter = maxStroke - (targetBlockMovementSize / 2);
      
      if (patternMode === 'random') {
         targetBlockCenter = minPossibleCenter + Math.random() * (maxPossibleCenter - minPossibleCenter);
      } else {
         targetBlockCenter = minStroke + (range / 2);
      }

      // 3. Linear speed CAP for this block (position-units per second). This no
      //    longer sets the rhythm — it only stops a long stroke from travelling
      //    faster than the carriage can manage.
      const baseTargetSpeed = MIN_LINEAR_SPEED + ((currentBlockSpeed - 1) / 9) * (MAX_LINEAR_SPEED - MIN_LINEAR_SPEED);
      const randFactorSpeed = (Math.random() * 2 - 1) * (randomness / 10) * 0.3;
      targetBlockSpeedVals = Math.max(10, baseTargetSpeed * (1 + randFactorSpeed));

      // 4. Tempo for this block, in direction-changes per minute. Randomness
      //    now has a visible effect here, where it varies the rhythm itself.
      const randFactorTempo = (Math.random() * 2 - 1) * (randomness / 10) * 0.35;
      targetBlockTempo = Math.max(10, strokesPerMin * currentTempoScale * (1 + randFactorTempo));

      // Set the end time for this block of consistent movement
      if (inCooldown) {
         // Re-evaluate every block so the wind-down keeps progressing.
         blockEndTime = currentTime;
      } else if (blockSizeSec > 0) {
        blockEndTime = currentTime + (blockSizeSec * 1000);
      } else {
        blockEndTime = currentTime; // Will recalculate on next tick
      }
    }

    // Handle smoothing transition
    let currentMovementSize = targetBlockMovementSize;
    let currentSpeedVals = targetBlockSpeedVals;
    let currentCenter = targetBlockCenter;
    let currentTempo = targetBlockTempo;

    if (transitionSec > 0 && currentTime < blockStartTime + (transitionSec * 1000) && prevBlockSpeedVals > 0) {
      const progress = (currentTime - blockStartTime) / (transitionSec * 1000);
      const smoothProgress = progress * progress * (3 - 2 * progress); // smoothstep
      currentMovementSize = prevBlockMovementSize + (targetBlockMovementSize - prevBlockMovementSize) * smoothProgress;
      currentSpeedVals = prevBlockSpeedVals + (targetBlockSpeedVals - prevBlockSpeedVals) * smoothProgress;
      currentCenter = prevBlockCenter + (targetBlockCenter - prevBlockCenter) * smoothProgress;
      currentTempo = prevBlockTempo + (targetBlockTempo - prevBlockTempo) * smoothProgress;
    }

    // Determine target position for this stroke
    // Add per-stroke randomness to make it feel natural
    const strokeRandSize = (Math.random() * 2 - 1) * (randomness / 10) * (range * 0.05);
    const actualMovementSize = Math.max(0, currentMovementSize + strokeRandSize);

    const blockTopPos = Math.min(maxStroke, currentCenter + (actualMovementSize / 2));
    const blockBottomPos = Math.max(minStroke, currentCenter - (actualMovementSize / 2));

    let nextPos;
    if (movingUp) {
      nextPos = blockTopPos;
    } else {
      nextPos = blockBottomPos;
    }
    nextPos = Math.round(nextPos); // ensure integer
    
    // Clamp to absolute bounds
    nextPos = Math.max(minStroke, Math.min(maxStroke, nextPos));

    const distance = Math.abs(nextPos - currentPos);

    // Add slight per-stroke randomness to speed
    const strokeRandSpeed = (Math.random() * 2 - 1) * (randomness / 10) * 0.1;
    const actualSpeed = Math.max(10, currentSpeedVals * (1 + strokeRandSpeed));

    // Tempo sets the rhythm; the linear speed cap only stretches a stroke that
    // is too long to travel in that time. Previously the gap was derived from
    // distance alone, which welded tempo to amplitude: halving the stroke
    // length automatically doubled the stroke rate, so narrow depth zones and
    // short Max Length produced unplayably dense scripts.
    const gapFromTempo = 60000 / Math.max(1, currentTempo);
    const gapFromSpeedCap = distance > 0 ? (distance / actualSpeed) * 1000 : 0;

    blockGap = Math.max(MIN_GAP_MS, Math.min(MAX_GAP_MS, Math.max(gapFromTempo, gapFromSpeedCap)));

    // Stop at the last stroke that fits. Snapping this final action onto
    // durationMs instead used to leave an arbitrarily short last gap — about
    // one script in four ended on a sub-50ms jump, i.e. a violent jerk the
    // device cannot perform.
    if (currentTime + blockGap > durationMs) break;
    currentTime += blockGap;

    actions.push({ at: Math.round(currentTime), pos: nextPos });

    currentPos = nextPos;
    movingUp = !movingUp;
  }

  return { actions };
}


export function generatePartialScript(oldActions, startMs, endMs, params) {
  let startIndex = -1;
  for (let i = oldActions.length - 1; i >= 0; i--) {
    if (oldActions[i].at <= startMs) { startIndex = i; break; }
  }
  let endIndex = -1;
  for (let i = 0; i < oldActions.length; i++) {
    if (oldActions[i].at >= endMs) { endIndex = i; break; }
  }
  if (startIndex === -1) startIndex = 0;
  if (endIndex === -1) endIndex = oldActions.length - 1;
  if (startIndex >= endIndex) return { actions: oldActions };
  const startAction = oldActions[startIndex];
  const endAction = oldActions[endIndex];
  const segmentDuration = endAction.at - startAction.at;
  const newSegment = generateProceduralScript(segmentDuration, { ...params, startPos: startAction.pos });
  const shiftedNewActions = newSegment.actions.map(a => ({ at: a.at + startAction.at, pos: a.pos }));
  const before = oldActions.slice(0, startIndex);
  const after = oldActions.slice(endIndex);
  const finalNewActions = shiftedNewActions.filter(a => a.at < endAction.at);
  return { actions: [...before, ...finalNewActions, ...after] };
}


export function removeJitter(oldActions, startMs, endMs, threshold = 5) {
  if (!oldActions || oldActions.length < 3) return { actions: oldActions };

  const start = startMs !== undefined ? startMs : 0;
  const end = endMs !== undefined ? endMs : Infinity;
  
  let kept = [oldActions[0]];
  
  for (let i = 1; i < oldActions.length - 1; i++) {
    const current = oldActions[i];
    
    if (current.at >= start && current.at <= end) {
      const prev = kept[kept.length - 1];
      let next = oldActions[i + 1];
      
      // Look ahead to find the next point that is significantly different to determine true direction
      let j = i + 1;
      while (j < oldActions.length - 1 && Math.abs(oldActions[j].pos - current.pos) < 1) {
          j++;
      }
      next = oldActions[j];

      const diffPrev = current.pos - prev.pos;
      const diffNext = next.pos - current.pos;
      
      // If it's a reversal (or flat) and the movement from prev was very small
      if (diffPrev * diffNext <= 0 && Math.abs(diffPrev) <= threshold) {
         continue; // Skip it (remove the jitter)
      }
    }
    
    kept.push(current);
  }
  
  kept.push(oldActions[oldActions.length - 1]);
  return { actions: kept };
}

export function modifyPartialScript(oldActions, startMs, endMs, modifierType) {
  if (modifierType === 'jitter') {
    return removeJitter(oldActions, startMs, endMs, 5);
  }

  let startIndex = -1;
  for (let i = oldActions.length - 1; i >= 0; i--) {
    if (oldActions[i].at <= startMs) { startIndex = i; break; }
  }
  let endIndex = -1;
  for (let i = 0; i < oldActions.length; i++) {
    if (oldActions[i].at >= endMs) { endIndex = i; break; }
  }
  if (startIndex === -1) startIndex = 0;
  if (endIndex === -1) endIndex = oldActions.length - 1;
  if (startIndex >= endIndex) return { actions: oldActions };
  const segment = oldActions.slice(startIndex, endIndex + 1);
  if (segment.length < 2) return { actions: oldActions };
  let newSegment = [];
  const actualStartMs = segment[0].at;
  const actualEndMs = segment[segment.length - 1].at;
  if (modifierType === 'higher' || modifierType === 'lower') {
    const offset = modifierType === 'higher' ? 10 : -10;
    newSegment = segment.map(a => ({ at: a.at, pos: Math.max(0, Math.min(100, Math.round(a.pos + offset))) }));
  } else if (modifierType === 'longer' || modifierType === 'shorter') {
    const avgPos = segment.reduce((sum, a) => sum + a.pos, 0) / segment.length;
    const factor = modifierType === 'longer' ? 1.25 : 0.8;
    newSegment = segment.map(a => ({ at: a.at, pos: Math.max(0, Math.min(100, Math.round(avgPos + (a.pos - avgPos) * factor))) }));
  } else if (modifierType === 'faster' || modifierType === 'slower') {
    const factor = modifierType === 'faster' ? 0.75 : 1.33;
    const avgGap = (actualEndMs - actualStartMs) / (segment.length - 1);
    const newGap = Math.max(50, avgGap * factor);
    const posArray = segment.map(a => a.pos);
    let currentTime = actualStartMs;
    let idx = 0;
    let direction = 1;
    while (currentTime <= actualEndMs) {
      newSegment.push({ at: Math.round(currentTime), pos: posArray[idx] });
      currentTime += newGap;
      idx += direction;
      if (idx >= posArray.length) { idx = Math.max(0, posArray.length - 2); direction = -1; }
      else if (idx < 0) { idx = Math.min(1, posArray.length - 1); direction = 1; }
    }
  }
  const before = oldActions.slice(0, startIndex);
  const after = oldActions.slice(endIndex + 1);
  return { actions: [...before, ...newSegment, ...after] };
}

