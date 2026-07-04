/**
 * Handy Service Integration
 * TheHandy API Integration
 * Maps to the official Handyfeeling Cloud API v2 (Current stable for HAMP control)
 */

const API_BASE = 'https://www.handyfeeling.com/api/handy/v2';

const getHeaders = (connectionKey) => ({
  'accept': 'application/json',
  'X-Connection-Key': connectionKey,
  'Content-Type': 'application/json',
});

/**
 * Checks if the Handy is connected and online.
 * @param {string} connectionKey - The device connection key.
 */
export const checkStatus = async (connectionKey) => {
  if (!connectionKey) return false;
  try {
    const response = await fetch(`${API_BASE}/status`, {
      method: 'GET',
      headers: getHeaders(connectionKey),
    });
    const data = await response.json();
    return data.connected === true;
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
 * Sets the speed of TheHandy via HAMP.
 * @param {string} connectionKey - The device connection key.
 * @param {number|string} speedPercentage - 0 to 100
 */
export const setSpeed = async (connectionKey, speedPercentage) => {
  if (!connectionKey) return;
  const velocity = Math.min(100, Math.max(0, parseInt(speedPercentage, 10)));
  
  try {
    await startHamp(connectionKey); // Ensure mode is running before applying velocity
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
 * @param {number|string} strokePercentage - 0 to 100
 */
export const setStrokeLength = async (connectionKey, strokePercentage) => {
  if (!connectionKey) return;
  const max = Math.min(100, Math.max(0, parseInt(strokePercentage, 10)));
  
  try {
    // Adjusts the stroke zone (min 0%, max variable%)
    await fetch(`${API_BASE}/slider`, {
      method: 'PUT',
      headers: getHeaders(connectionKey),
      body: JSON.stringify({ min: 0, max }),
    });
  } catch (error) {
    console.error('Handy setStrokeLength error:', error);
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