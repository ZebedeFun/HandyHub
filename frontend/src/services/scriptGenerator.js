/**
 * Generates a procedural funscript based on parameters.
 * @param {number} durationMs - The duration of the video in milliseconds.
 * @param {object} params - The generation parameters.
 * @param {number} params.baseSpeed - Speed factor (1 to 10), higher means shorter time between strokes.
 * @param {number} params.intensity - Intensity factor (1 to 10), higher means larger positional differences.
 * @param {number} params.randomness - Randomness factor (0 to 10), higher means less steady rhythm.
 * @param {number} params.minStroke - Minimum position (0 to 100).
 * @param {number} params.maxStroke - Maximum position (0 to 100).
 * @returns {object} - The funscript object `{ actions: [{at, pos}], metadata }`
 */
export function generateProceduralScript(durationMs, params) {
  const {
    baseSpeed = 5,
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

  let prevBlockMovementSize = 0;
  let prevBlockSpeedVals = 0;
  let prevBlockCenter = 0;
  let blockStartTime = 0;

  while (currentTime < durationMs) {
    const timeRemainingMs = durationMs - currentTime;
    const inCooldown = cooldownSec > 0 && timeRemainingMs <= cooldownSec * 1000;
    const range = maxStroke - minStroke;

    // Pick new stroke parameters if we are past the current block's duration
    // Also force re-evaluation if we just entered the cooldown phase
    if (currentTime >= blockEndTime || (inCooldown && blockGap < 500 && blockEndTime !== durationMs)) {
      
      prevBlockMovementSize = targetBlockMovementSize;
      prevBlockSpeedVals = targetBlockSpeedVals;
      prevBlockCenter = targetBlockCenter || (minStroke + range / 2);
      blockStartTime = currentTime;

      let currentBlockSpeed = baseSpeed;
      let currentBlockLengthPct = maxStrokeLength;

      // Determine base parameters for THIS block
      if (inCooldown) {
         currentBlockSpeed = 1;
         currentBlockLengthPct = 10;
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

      // 3. Pick a Target Speed (points per second)
      const minTargetSpeed = 40;
      const maxTargetSpeed = 400;
      const baseTargetSpeed = minTargetSpeed + ((currentBlockSpeed - 1) / 9) * (maxTargetSpeed - minTargetSpeed);
      const randFactorSpeed = (Math.random() * 2 - 1) * (randomness / 10) * 0.3; 
      targetBlockSpeedVals = Math.max(10, baseTargetSpeed * (1 + randFactorSpeed));
      
      // Set the end time for this block of consistent movement
      if (inCooldown) {
         blockEndTime = durationMs; // Lock in cooldown settings until the end
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

    if (transitionSec > 0 && currentTime < blockStartTime + (transitionSec * 1000) && prevBlockSpeedVals > 0) {
      const progress = (currentTime - blockStartTime) / (transitionSec * 1000);
      const smoothProgress = progress * progress * (3 - 2 * progress); // smoothstep
      currentMovementSize = prevBlockMovementSize + (targetBlockMovementSize - prevBlockMovementSize) * smoothProgress;
      currentSpeedVals = prevBlockSpeedVals + (targetBlockSpeedVals - prevBlockSpeedVals) * smoothProgress;
      currentCenter = prevBlockCenter + (targetBlockCenter - prevBlockCenter) * smoothProgress;
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

    // Calculate gap required to reach nextPos from currentPos at current speed
    const distance = Math.abs(nextPos - currentPos);
    
    // Add slight per-stroke randomness to speed
    const strokeRandSpeed = (Math.random() * 2 - 1) * (randomness / 10) * 0.1;
    const actualSpeed = Math.max(10, currentSpeedVals * (1 + strokeRandSpeed));

    let calculatedGap = 50;
    if (distance > 0) {
      calculatedGap = (distance / actualSpeed) * 1000;
    }
    
    // Clamp gap
    blockGap = Math.max(50, Math.min(4000, calculatedGap));

    // Apply the chosen gap
    currentTime += blockGap;
    if (currentTime > durationMs) {
      currentTime = durationMs;
    }

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


export function modifyPartialScript(oldActions, startMs, endMs, modifierType) {
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

