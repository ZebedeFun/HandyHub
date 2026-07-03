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
    intensity = 5,
    randomness = 5,
    minStroke = 0,
    maxStroke = 100,
    patternMode = 'consistent',
    blockSizeSec = 0
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

  while (currentTime < durationMs) {
    let effectiveSpeed = baseSpeed;
    let effectiveIntensity = intensity;
    
    // If building over time, scale effective parameters based on progress
    if (patternMode === 'build') {
      const progress = Math.min(1, currentTime / durationMs);
      // Start at 1 (very slow/soft), build up to the user's requested settings
      effectiveSpeed = 1 + (baseSpeed - 1) * progress;
      effectiveIntensity = 1 + (intensity - 1) * progress;
    }

    const range = maxStroke - minStroke;

    // Pick new stroke parameters if we are past the current block's duration
    if (currentTime >= blockEndTime) {
      // Pick a gap (speed)
      const randFactorGap = (Math.random() * 2 - 1) * (randomness / 10) * 0.8;
      const avgGap = 2500 - (effectiveSpeed * 200);
      blockGap = Math.max(100, Math.min(4000, avgGap * (1 + randFactorGap)));
      
      // Pick a movement size (intensity)
      const baseMovement = range * (0.2 + (effectiveIntensity / 10) * 0.8);
      const randFactorPos = (Math.random() * 2 - 1) * (randomness / 10) * 0.2;
      blockMovementSize = Math.max(0, Math.min(range, baseMovement + (range * randFactorPos)));
      
      // Set the end time for this block of consistent movement
      if (blockSizeSec > 0) {
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

