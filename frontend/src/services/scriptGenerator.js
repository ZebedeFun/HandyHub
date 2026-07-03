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
    maxStroke = 100
  } = params;

  const actions = [];
  let currentTime = 0;
  
  // Start at a default position
  let currentPos = Math.floor((minStroke + maxStroke) / 2);
  actions.push({ at: 0, pos: currentPos });

  // A bit of state to keep track of direction
  let movingUp = true;

  while (currentTime < durationMs) {
    // 1. Calculate time delta (ms) for the next stroke
    // baseSpeed 1 -> slow (maybe 2000ms), 10 -> fast (maybe 200ms)
    // Map baseSpeed to an average ms gap
    const avgGap = 2500 - (baseSpeed * 200); 
    
    // Apply randomness to gap
    // randomness 0 -> exactly avgGap
    // randomness 10 -> up to +/- 80% variation
    const randFactorGap = (Math.random() * 2 - 1) * (randomness / 10) * 0.8;
    let gap = avgGap * (1 + randFactorGap);
    
    // Enforce reasonable limits on gap (e.g. 100ms min, 4000ms max)
    gap = Math.max(100, Math.min(4000, gap));
    
    currentTime += gap;
    if (currentTime > durationMs) {
      currentTime = durationMs;
    }

    // 2. Calculate next position
    // intensity 1 -> small movements (e.g. 20% of range)
    // intensity 10 -> full range movements
    const range = maxStroke - minStroke;
    const movementSize = range * (0.2 + (intensity / 10) * 0.8);
    
    let nextPos;
    if (movingUp) {
      nextPos = currentPos + movementSize;
      if (nextPos > maxStroke) nextPos = maxStroke;
    } else {
      nextPos = currentPos - movementSize;
      if (nextPos < minStroke) nextPos = minStroke;
    }

    // Apply randomness to position
    const randFactorPos = (Math.random() * 2 - 1) * (randomness / 10) * 0.2; // up to 20% noise
    nextPos = nextPos + (range * randFactorPos);
    
    // Clamp to min/max
    nextPos = Math.max(minStroke, Math.min(maxStroke, nextPos));

    actions.push({ at: Math.round(currentTime), pos: Math.round(nextPos) });

    currentPos = nextPos;
    // Switch direction for the next stroke, though randomness might cause it to flip early or late if we added more logic
    movingUp = !movingUp;
  }

  return { actions };
}
