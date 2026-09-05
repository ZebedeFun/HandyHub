/**
 * Handy Service Integration
 * TheHandy API Integration
 * Maps to the official Handyfeeling Cloud API v2 (Current stable for HAMP control)
 */

const API_BASE = 'https://www.handyfeeling.com/api/handy/v2';

// HAMP `velocity` is a LINEAR carriage speed, not a stroke rate: the device
// travels at a fixed mm/s regardless of how far it has to go, so shortening the
// slide zone at a fixed velocity makes the strokes come round faster.
// The API only documents "velocity, 0-100"; these are the published hardware
// figures the percentage maps onto. Corroborated by the SDK note that 0% does
// not stop the device but moves it at its slowest speed — i.e. a non-zero floor.
// Adjust here if the real numbers turn out to differ.
export const DEVICE_MIN_MM_PER_SEC = 32;
export const DEVICE_MAX_MM_PER_SEC = 450;
// Full travel of the carriage, i.e. what position 0 -> 100 corresponds to.
export const DEVICE_FULL_STROKE_MM = 125;

/** HAMP velocity percentage -> carriage speed in mm/s. */
export const velocityToMmPerSec = (velocity) => {
  const v = Math.min(100, Math.max(0, velocity));
  return DEVICE_MIN_MM_PER_SEC + (v / 100) * (DEVICE_MAX_MM_PER_SEC - DEVICE_MIN_MM_PER_SEC);
};

/**
 * Carriage speed in mm/s -> HAMP velocity percentage.
 * Returns a negative number when the requested speed is below what the device
 * can do, so callers can tell "clamped" apart from "genuinely slowest".
 */
export const mmPerSecToVelocity = (mmPerSec) =>
  ((mmPerSec - DEVICE_MIN_MM_PER_SEC) / (DEVICE_MAX_MM_PER_SEC - DEVICE_MIN_MM_PER_SEC)) * 100;

const getHeaders = (connectionKey) => ({
  'accept': 'application/json',
  'X-Connection-Key': connectionKey,
  'Content-Type': 'application/json',
});

/**
 * Checks if the Handy is connected and online.
 * Uses the correct /connected endpoint (not /status which returns mode info).
 * @param {string} connectionKey - The device connection key.
 */
export const checkStatus = async (connectionKey) => {
  if (!connectionKey) return false;
  try {
    const response = await fetch(`${API_BASE}/connected`, {
      method: 'GET',
      headers: getHeaders(connectionKey),
    });
    if (!response.ok) return false;
    const data = await response.json();
    // Handy v2 /connected returns { connected: true/false } or just a boolean result
    if (typeof data === 'boolean') return data;
    if (typeof data.connected === 'boolean') return data.connected;
    // Some firmware versions return { result: true } or a 200 with any body = connected
    return response.status === 200;
  } catch (error) {
    console.error('Handy checkStatus error:', error);
    return false;
  }
};

/**
 * Ensures the HAMP (Hardware Asynchronous Motor Protocol) is active.
 */
export const startHamp = async (connectionKey) => {
  if (!connectionKey) return;
  try {
    const response = await fetch(`${API_BASE}/hamp/start`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
    });
    return await response.json();
  } catch (error) {
    console.error('Handy startHamp error:', error);
  }
};

/**
 * Stops HAMP motion immediately.
 * @param {string} connectionKey - The device connection key.
 */
export const stopHamp = async (connectionKey) => {
  if (!connectionKey) return;
  isHampActive = false; // Reset so next call to setSpeed restarts HAMP cleanly
  try {
    const response = await fetch(`${API_BASE}/hamp/stop`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
    });
    return await response.json();
  } catch (error) {
    console.error('Handy stopHamp error:', error);
  }
};

let isHampActive = false;

/**
 * Sets the speed of TheHandy via HAMP.
 * @param {string} connectionKey - The device connection key.
 * @param {number|string} speedPercentage - 0 to 100
 */
export const setSpeed = async (connectionKey, speedPercentage) => {
  if (!connectionKey) return;
  const velocity = Math.min(100, Math.max(0, parseInt(speedPercentage, 10)));
  
  try {
    if (!isHampActive) {
      await startHamp(connectionKey); // Ensure mode is running
      isHampActive = true;
    }
    await fetch(`${API_BASE}/hamp/velocity`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
      body: JSON.stringify({ velocity }),
    });
  } catch (error) {
    console.error('Handy setSpeed error:', error);
  }
};

/**
 * Sets the stroke length by adjusting the bottom and top boundaries of the slider zone.
 * @param {string} connectionKey - The device connection key.
 * @param {number|string} min - 0 to 100
 * @param {number|string} max - 0 to 100
 */
export const setStrokeZone = async (connectionKey, min, max) => {
  if (!connectionKey) return;
  const safeMin = Math.min(100, Math.max(0, parseInt(min, 10)));
  const safeMax = Math.min(100, Math.max(0, parseInt(max, 10)));
  
  try {
    await fetch(`${API_BASE}/slide`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
      body: JSON.stringify({ min: safeMin, max: safeMax }),
    });
  } catch (error) {
    console.error('Handy setStrokeZone error:', error);
  }
};

/**
 * Calculates the server time offset to sync playback.
 */
export const getServerTimeOffset = async (connectionKey) => {
  if (!connectionKey) return 0;
  try {
    const start = Date.now();
    const response = await fetch(`${API_BASE}/servertime`, {
      method: 'GET',
      headers: getHeaders(connectionKey),
    });
    const end = Date.now();
    const data = await response.json();
    const rtt = end - start;
    const estimatedServerTime = data.serverTime + rtt / 2;
    return estimatedServerTime - end;
  } catch (error) {
    console.error('Handy getServerTimeOffset error:', error);
    return 0;
  }
};

/**
 * Prepares the Handy with a script URL.
 */
export const hsspSetup = async (connectionKey, url) => {
  if (!connectionKey || !url) return;
  try {
    const response = await fetch(`${API_BASE}/hssp/setup`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
      body: JSON.stringify({ url }),
    });
    return await response.json();
  } catch (error) {
    console.error('Handy hsspSetup error:', error);
  }
};

/**
 * Starts playing the prepared script.
 */
export const hsspPlay = async (connectionKey, estimatedServerTime, startTime) => {
  if (!connectionKey) return;
  try {
    const response = await fetch(`${API_BASE}/hssp/play`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
      body: JSON.stringify({ estimatedServerTime, startTime }),
    });
    return await response.json();
  } catch (error) {
    console.error('Handy hsspPlay error:', error);
  }
};

/**
 * Stops playing the script.
 */
export const hsspStop = async (connectionKey) => {
  if (!connectionKey) return;
  try {
    const response = await fetch(`${API_BASE}/hssp/stop`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
    });
    return await response.json();
  } catch (error) {
    console.error('Handy hsspStop error:', error);
  }
};