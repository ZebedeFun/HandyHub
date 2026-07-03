/**
 * Generates a procedural funscript based on parameters.
 * @param {number} durationMs - The duration of the video in milliseconds.
 * @param {object} params - The generation parameters.
 * @param {number} params.baseSpeed - Speed factor (1 to 10), higher means shorter time between strokes.
 * @param {number} params.intensity - Intensity factor (1 to 10), higher means larger positional differences.
 * @param {number} params.randomness - Randomness factor (0 to 10), higher means less steady rhythm.
 * @param {number} params.minStroke - Minimum position (0 to 100).
 * @param {number} params.maxStroke - Maximum position (0 to 100).
 * @returns {object} - The funscript object `{ actions: [{at, pos}] }`
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
    cooldownSec = 0
  } = params;

  const actions = [];
  let currentTime = 0;
  
  // Start at a default position
  let currentPos = Math.floor((minStroke + maxStroke) / 2);
  actions.push({ at: 0, pos: currentPos });

  // State for direction and blocks
  let movingUp = true;
  let blockEndTime = 0;
  let blockGap = 0;
  let blockMovementSize = 0;
  
  // State for the current block's target parameters
  let currentBlockSpeed = baseSpeed;
  let currentBlockLengthPct = maxStrokeLength;

  while (currentTime < durationMs) {
    const timeRemainingMs = durationMs - currentTime;
    const inCooldown = cooldownSec > 0 && timeRemainingMs <= cooldownSec * 1000;
    const range = maxStroke - minStroke;

    // Pick new stroke parameters if we are past the current block's duration
    // Also force re-evaluation if we just entered the cooldown phase
    if (currentTime >= blockEndTime || (inCooldown && blockGap < 500)) {
      
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
      
      // 1. Pick a movement size based on the chosen block length
      const baseMovement = range * (currentBlockLengthPct / 100);
      const randFactorPos = (Math.random() * 2 - 1) * (randomness / 10) * 0.2;
      blockMovementSize = Math.max(0, Math.min(range, baseMovement + (range * randFactorPos)));

      // 2. Pick a Target Speed (points per second)
      // Max physical speed of the device is ~400 points/sec. 
      // Speed mapping: 1 = 40 pts/sec, 10 = 400 pts/sec
      const minTargetSpeed = 40;
      const maxTargetSpeed = 400;
      const targetSpeed = minTargetSpeed + ((currentBlockSpeed - 1) / 9) * (maxTargetSpeed - minTargetSpeed);
      
      // 3. Add randomness to target speed
      const randFactorSpeed = (Math.random() * 2 - 1) * (randomness / 10) * 0.3; 
      const finalSpeed = Math.max(10, targetSpeed * (1 + randFactorSpeed));
      
      // 4. Calculate required time (gap) to achieve that speed for the chosen movement size
      const calculatedGap = (blockMovementSize / finalSpeed) * 1000;
      
      // 5. Clamp gap to prevent locking up the hardware (min 50ms, max 4000ms)
      blockGap = Math.max(50, Math.min(4000, calculatedGap));
      
      // Set the end time for this block of consistent movement
      if (inCooldown) {
         blockEndTime = durationMs; // Lock in cooldown settings until the end
      } else if (blockSizeSec > 0) {
        blockEndTime = currentTime + (blockSizeSec * 1000);
      } else {
        blockEndTime = currentTime; // Will recalculate on next tick
      }
    }

    // Apply the chosen gap
    currentTime += blockGap;
    if (currentTime > durationMs) {
      currentTime = durationMs;
    }

    // Calculate the next position based on direction and chosen movement size
    let nextPos;
    if (movingUp) {
      nextPos = currentPos + blockMovementSize;
      if (nextPos > maxStroke) nextPos = maxStroke;
    } else {
      nextPos = currentPos - blockMovementSize;
      if (nextPos < minStroke) nextPos = minStroke;
    }

    // Clamp to absolute bounds
    nextPos = Math.max(minStroke, Math.min(maxStroke, nextPos));
    actions.push({ at: Math.round(currentTime), pos: Math.round(nextPos) });

    currentPos = nextPos;
    movingUp = !movingUp;
  }

  return { actions };
}

