import React, { useState, useEffect, useRef } from 'react';
import { setSpeed, setStrokeZone } from '../../services/handyService';

export default function AutoSync({ isDarkMode, toggleTheme }) {
  const [connectionKey, setConnectionKey] = useState(localStorage.getItem('handySyncKey') || '');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  
  // Controls
  const [minHeight, setMinHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(100);
  const [minSpeed, setMinSpeed] = useState(20);
  const [maxSpeed, setMaxSpeed] = useState(100);
  const [smoothing, setSmoothing] = useState(50); // 0-100
  const [testMode, setTestMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Refs for tracking
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const testCanvasRef = useRef(null);
  const prevFrameRef = useRef(null);
  const requestRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const currentSpeedRef = useRef(0);
  
  // Internal state for UI visualization
  const [currentMotion, setCurrentMotion] = useState(0);

  useEffect(() => {
    localStorage.setItem('handySyncKey', connectionKey);
  }, [connectionKey]);

  useEffect(() => {
    // Send stroke zone when it changes (throttled)
    const timeout = setTimeout(() => {
      if (isSyncing && connectionKey) {
        setStrokeZone(connectionKey, minHeight, maxHeight);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minHeight, maxHeight, isSyncing, connectionKey]);

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
    }
  };

  const startTracking = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsSyncing(true);
    setStrokeZone(connectionKey, minHeight, maxHeight);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Use small resolution for performance
    canvas.width = 64; 
    canvas.height = 64;

    const trackFrame = (time) => {
      if (videoRef.current.paused || videoRef.current.ended) {
        requestRef.current = requestAnimationFrame(trackFrame);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frameData.data;

      if (prevFrameRef.current) {
        let diffSum = 0;
        let diffPixels = 0;
        const prevData = prevFrameRef.current.data;
        const testCtx = testMode && testCanvasRef.current ? testCanvasRef.current.getContext('2d') : null;
        
        let testImgData;
        if (testMode && testCtx) {
          testCanvasRef.current.width = canvas.width;
          testCanvasRef.current.height = canvas.height;
          testImgData = testCtx.createImageData(canvas.width, canvas.height);
        }

        // Compare grayscale values
        for (let i = 0; i < data.length; i += 4) {
          const r1 = data[i], g1 = data[i+1], b1 = data[i+2];
          const r2 = prevData[i], g2 = prevData[i+1], b2 = prevData[i+2];
          
          const gray1 = (r1 + g1 + b1) / 3;
          const gray2 = (r2 + g2 + b2) / 3;
          const diff = Math.abs(gray1 - gray2);
          
          if (diff > 15) { // Threshold for noise
            diffSum += diff;
            diffPixels++;
          }
          
          if (testMode && testImgData) {
            const val = diff > 15 ? 255 : 0;
            testImgData.data[i] = val; // R
            testImgData.data[i+1] = 0; // G
            testImgData.data[i+2] = 0; // B
            testImgData.data[i+3] = 255; // Alpha
          }
        }
        
        if (testMode && testCtx && testImgData) {
          testCtx.putImageData(testImgData, 0, 0);
        }

        // Calculate motion intensity (0.0 to 1.0)
        // Max possible diffPixels is 64*64=4096. 
        const rawIntensity = Math.min(1.0, (diffPixels / (canvas.width * canvas.height)) * 3.0); 
        
        // Apply smoothing (rate of change)
        const smoothFactor = smoothing / 100; // 0 to 1
        const smoothed = (currentSpeedRef.current * smoothFactor) + (rawIntensity * (1 - smoothFactor));
        currentSpeedRef.current = smoothed;
        
        setCurrentMotion(Math.round(smoothed * 100));

        // Map to min/max speed
        const mappedSpeed = minSpeed + (smoothed * (maxSpeed - minSpeed));
        
        // Throttled API call (e.g., max twice a second)
        if (time - lastUpdateRef.current > 500) {
          setSpeed(connectionKey, Math.round(mappedSpeed));
          lastUpdateRef.current = time;
        }
      }

      prevFrameRef.current = frameData;
      requestRef.current = requestAnimationFrame(trackFrame);
    };
    
    requestRef.current = requestAnimationFrame(trackFrame);
  };

  const stopTracking = () => {
    setIsSyncing(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    prevFrameRef.current = null;
    setSpeed(connectionKey, 0); // Stop device
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans`}>
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600">HandyTime</a>
          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full text-sm font-semibold">Auto-Sync</span>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="text" 
            placeholder="Handy Connection Key" 
            value={connectionKey}
            onChange={(e) => setConnectionKey(e.target.value)}
            className="w-48 px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={() => setShowHelp(true)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors text-sm">Help</button>
          <button onClick={toggleTheme} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-lg transition-colors" title="Toggle Theme">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Video Player */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative">
            {!videoUrl ? (
              <div className="h-[60vh] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 m-4 rounded-xl">
                <p className="text-lg font-medium mb-4 text-slate-600 dark:text-slate-400">Select a video to auto-sync</p>
                <label className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium cursor-pointer transition-colors shadow-md">
                  Choose File
                  <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="relative w-full h-[60vh] bg-black">
                <video 
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  crossOrigin="anonymous"
                  className="w-full h-full object-contain"
                  onPlay={isSyncing ? null : startTracking}
                  onPause={stopTracking}
                />
                {testMode && (
                  <div className="absolute top-4 left-4 bg-black/70 p-2 rounded-lg border border-slate-600 backdrop-blur-sm pointer-events-none">
                    <p className="text-xs text-slate-300 mb-1 font-semibold uppercase tracking-wider">Motion Heatmap</p>
                    <canvas ref={testCanvasRef} className="w-32 h-32 border border-slate-500 bg-black/50" />
                  </div>
                )}
                {/* Hidden processing canvas */}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}
            
            {videoUrl && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={isSyncing ? stopTracking : startTracking}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors shadow-sm ${isSyncing ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                  >
                    {isSyncing ? '⏹ Stop Syncing' : '▶️ Start Syncing'}
                  </button>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-100 border-slate-300" />
                    Test Mode (Visualizer)
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Current Output:</span>
                  <div className="w-32 h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200 ease-out" style={{ width: `${currentMotion}%` }} />
                  </div>
                  <span className="text-sm font-bold w-8">{currentMotion}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Controls */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span>🎛️</span> Sync Parameters
            </h2>
            
            <div className="space-y-8">
              {/* Stroke Range (Min/Max Height) */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Stroke Zone (Min/Max Height)</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{minHeight}% - {maxHeight}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min="0" max="50" value={minHeight} onChange={(e) => setMinHeight(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" title="Minimum Height" />
                  <input type="range" min="50" max="100" value={maxHeight} onChange={(e) => setMaxHeight(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" title="Maximum Height" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Sets the physical bottom and top boundaries of the device.</p>
              </div>

              {/* Speed Range */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Speed Mapping (Min/Max)</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{minSpeed}% - {maxSpeed}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min="0" max="50" value={minSpeed} onChange={(e) => setMinSpeed(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" title="Minimum Speed (when no motion)" />
                  <input type="range" min="50" max="100" value={maxSpeed} onChange={(e) => setMaxSpeed(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" title="Maximum Speed (max motion)" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Maps video motion intensity to device speed.</p>
              </div>

              {/* Smoothing / Rate of Change */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Rate of Change (Smoothing)</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{smoothing}%</span>
                </div>
                <input type="range" min="0" max="95" value={smoothing} onChange={(e) => setSmoothing(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Higher values prevent erratic jumping but increase latency. Lower is more responsive.</p>
              </div>
            </div>
          </div>
          
          <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800">
            <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-2">How it works</h3>
            <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
              Auto-Sync analyzes the video frame-by-frame for pixel movement. Faster on-screen motion translates to higher device speed automatically.
            </p>
          </div>
        </div>

      </main>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">Auto-Sync Help</h2>
            
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p><strong>What is Auto-Sync?</strong><br/>It uses computer vision running entirely in your browser to detect motion in the video and match the speed of TheHandy to the intensity of the scene.</p>
              
              <p><strong>Stroke Zone:</strong> Limits how far up and down the device moves. 0% is the absolute bottom, 100% is the absolute top.</p>
              
              <p><strong>Speed Mapping:</strong> Set the base speed when nothing is moving (Min), and the maximum speed when the screen is chaotic (Max).</p>
              
              <p><strong>Smoothing:</strong> If the device is jumping speeds too quickly and erratically, increase the smoothing to average out the changes.</p>
              
              <p><strong>Test Mode:</strong> Turn this on to see a small heatmap of what the algorithm thinks is "moving". Red pixels indicate detected motion.</p>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button onClick={() => setShowHelp(false)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
