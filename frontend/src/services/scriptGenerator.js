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

  while (currentTime < durationMs) {
    let effectiveSpeed = baseSpeed;
    let effectiveIntensity = intensity;
    
    const timeRemainingMs = durationMs - currentTime;
    const inCooldown = cooldownSec > 0 && timeRemainingMs <= cooldownSec * 1000;

    if (inCooldown) {
      // Force minimal movement and slow speed during cooldown
      effectiveSpeed = 1;
      effectiveIntensity = 1;
    } else if (patternMode === 'build') {
      // Scale progress up to the start of the cooldown
      const activeDuration = cooldownSec > 0 ? durationMs - (cooldownSec * 1000) : durationMs;
      const progress = activeDuration > 0 ? Math.min(1, currentTime / activeDuration) : 1;
      // Start at 1 (very slow/soft), build up to the user's requested settings
      effectiveSpeed = 1 + (baseSpeed - 1) * progress;
      effectiveIntensity = 1 + (intensity - 1) * progress;
    }

    const range = maxStroke - minStroke;

    // Pick new stroke parameters if we are past the current block's duration
    // Also force re-evaluation if we just entered the cooldown phase
    if (currentTime >= blockEndTime || (inCooldown && blockGap < 500)) {
      
      // 1. Pick a movement size (intensity)
      // Intensity mapping: 1 = 5% of range, 10 = 100% of range
      const minInt = 0.05;
      const maxInt = 1.0;
      const intensityRatio = minInt + ((effectiveIntensity - 1) / 9) * (maxInt - minInt);
      
      const baseMovement = range * intensityRatio;
      const randFactorPos = (Math.random() * 2 - 1) * (randomness / 10) * 0.2;
      blockMovementSize = Math.max(0, Math.min(range, baseMovement + (range * randFactorPos)));

      // 2. Pick a Target Speed (points per second)
      // Max physical speed of the device is ~400 points/sec. 
      // Speed mapping: 1 = 40 pts/sec, 10 = 400 pts/sec
      const minTargetSpeed = 40;
      const maxTargetSpeed = 400;
      const targetSpeed = minTargetSpeed + ((effectiveSpeed - 1) / 9) * (maxTargetSpeed - minTargetSpeed);
      
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

