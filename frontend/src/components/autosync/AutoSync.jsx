import React, { useState, useEffect, useRef } from 'react';
import { setSpeed, setStrokeZone } from '../../services/handyService';
import { Settings, Music, Loader2 } from 'lucide-react';

export default function AutoSync({ isDarkMode, toggleTheme, settings, openSettings }) {
  const [connectionKey, setConnectionKey] = useState(localStorage.getItem('handySyncKey') || '');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  
  // Audio Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioEnvelope, setAudioEnvelope] = useState([]);
  const fps = 20; // 20 updates per second for smooth lookup
  
  // Controls
  const [minHeight, setMinHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(100);
  const [minSpeed, setMinSpeed] = useState(20);
  const [maxSpeed, setMaxSpeed] = useState(100);
  const [smoothing, setSmoothing] = useState(70); // 0-100
  const [sensitivity, setSensitivity] = useState(60);
  const [showHelp, setShowHelp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs for dynamic parameter reading in requestAnimationFrame
  const minSpeedRef = useRef(minSpeed);
  const maxSpeedRef = useRef(maxSpeed);
  const smoothingRef = useRef(smoothing);
  const sensitivityRef = useRef(sensitivity);
  
  useEffect(() => { minSpeedRef.current = minSpeed; }, [minSpeed]);
  useEffect(() => { maxSpeedRef.current = maxSpeed; }, [maxSpeed]);
  useEffect(() => { smoothingRef.current = smoothing; }, [smoothing]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  
  // Refs for tracking
  const videoRef = useRef(null);
  const requestRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const currentSpeedRef = useRef(0);
  const audioCtxRef = useRef(null);
  const envelopeRef = useRef([]);
  
  useEffect(() => { envelopeRef.current = audioEnvelope; }, [audioEnvelope]);
  
  // Internal state for UI visualization
  const [currentMotion, setCurrentMotion] = useState(0);

  useEffect(() => {
    localStorage.setItem('handySyncKey', connectionKey);
  }, [connectionKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isSyncing && connectionKey) {
        setStrokeZone(connectionKey, minHeight, maxHeight);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minHeight, maxHeight, isSyncing, connectionKey]);

  const analyzeAudio = async (file) => {
    setIsAnalyzing(true);
    setAudioEnvelope([]);
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      
      const blockSize = Math.floor(audioBuffer.sampleRate / fps);
      const envelope = [];
      
      // Calculate RMS for each block
      for (let i = 0; i < channelData.length; i += blockSize) {
        let sumSquares = 0;
        let count = 0;
        // Step by 10 to speed up analysis without losing much fidelity
        for (let j = 0; j < blockSize && (i + j) < channelData.length; j += 10) {
          sumSquares += channelData[i + j] * channelData[i + j];
          count++;
        }
        envelope.push(Math.sqrt(sumSquares / count));
      }
      
      // Normalize
      let maxVal = 0;
      for (let i = 0; i < envelope.length; i++) {
        if (envelope[i] > maxVal) maxVal = envelope[i];
      }
      
      if (maxVal > 0) {
        for (let i = 0; i < envelope.length; i++) {
          envelope[i] = envelope[i] / maxVal;
        }
      }
      
      setAudioEnvelope(envelope);
    } catch (err) {
      console.error("Failed to analyze audio:", err);
      alert("Could not extract audio from this video. Ensure it contains an audio track.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      analyzeAudio(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.type.startsWith('video/') || file.name.endsWith('.mp4')) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      analyzeAudio(file);
    }
  };

  const startTracking = () => {
    if (!videoRef.current || audioEnvelope.length === 0) return;
    setIsSyncing(true);
    setStrokeZone(connectionKey, minHeight, maxHeight);
    
    const trackFrame = (time) => {
      if (videoRef.current.paused || videoRef.current.ended) {
        requestRef.current = requestAnimationFrame(trackFrame);
        return;
      }
      
      const currentTime = videoRef.current.currentTime;
      const index = Math.floor(currentTime * fps);
      const envelope = envelopeRef.current;
      
      if (envelope && index >= 0 && index < envelope.length) {
        let rawIntensity = envelope[index];
        
        // Apply sensitivity (maps 0-100 to a multiplier roughly 0.1x to 10x)
        const multiplier = Math.pow(10, (sensitivityRef.current - 50) / 30); 
        rawIntensity = Math.min(1.0, rawIntensity * multiplier);
        
        // Apply smoothing
        const smoothFactor = smoothingRef.current / 100;
        const smoothed = (currentSpeedRef.current * smoothFactor) + (rawIntensity * (1 - smoothFactor));
        currentSpeedRef.current = smoothed;
        
        const mappedSpeed = minSpeedRef.current + (smoothed * (maxSpeedRef.current - minSpeedRef.current));
        setCurrentMotion(Math.round(mappedSpeed));
        
        // Throttled API call (e.g., max 3-4 times a second to prevent overloading)
        if (time - lastUpdateRef.current > 300) {
          setSpeed(connectionKey, Math.round(mappedSpeed));
          lastUpdateRef.current = time;
        }
      }

      requestRef.current = requestAnimationFrame(trackFrame);
    };
    
    requestRef.current = requestAnimationFrame(trackFrame);
  };

  const stopTracking = () => {
    setIsSyncing(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    setSpeed(connectionKey, 0);
    setCurrentMotion(0);
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div 
      className={`min-h-screen ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans relative`}
      onDragOver={handleDragOver}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 bg-indigo-500/20 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-indigo-500 border-dashed"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center pointer-events-none">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Drop Video Here</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-center max-w-sm">
              Drop an MP4 video anywhere to load it for audio beat-sync.
            </p>
          </div>
        </div>
      )}
      
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600">HandyTime</a>
          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full text-sm font-semibold flex items-center gap-1">
            <Music size={14} /> Audio-Sync
          </span>
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
          <button onClick={openSettings} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-lg transition-colors" title="Settings">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Video Player */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative">
            {!videoUrl ? (
              <div className="h-[60vh] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 m-4 rounded-xl">
                <Music size={48} className="text-indigo-400 mb-4 opacity-50" />
                <p className="text-lg font-medium mb-4 text-slate-600 dark:text-slate-400">Select a video for audio analysis</p>
                <label className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium cursor-pointer transition-colors shadow-md">
                  Choose File
                  <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="relative w-full h-[60vh] bg-black group">
                {isAnalyzing && (
                  <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
                    <h3 className="text-xl font-bold">Analyzing Audio Map...</h3>
                    <p className="text-slate-300 mt-2">Processing video sound to map patterns.</p>
                  </div>
                )}
                <video 
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full h-full object-contain"
                  onPlay={isSyncing && !isAnalyzing ? null : startTracking}
                  onPause={stopTracking}
                />
              </div>
            )}
            
            {videoUrl && !isAnalyzing && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={isSyncing ? stopTracking : startTracking}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors shadow-sm ${isSyncing ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                  >
                    {isSyncing ? '⏹ Stop Syncing' : '▶️ Start Syncing'}
                  </button>
                  <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Audio Mapped ({audioEnvelope.length} frames)
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Reaction:</span>
                    <div className="w-24 h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-blue-500 transition-all duration-200 ease-out" style={{ width: `${currentMotion}%` }} />
                    </div>
                    <span className="text-xs font-bold font-mono w-8">{currentMotion}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Stroke:</span>
                    <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">{minHeight}% - {maxHeight}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Controls */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span>🎛️</span> Audio Beat Parameters
            </h2>
            
            <div className="space-y-8">
              {/* Stroke Range */}
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
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Speed Mapping (Quiet/Loud)</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{minSpeed}% - {maxSpeed}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min="0" max="50" value={minSpeed} onChange={(e) => setMinSpeed(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" title="Quiet Speed" />
                  <input type="range" min="50" max="100" value={maxSpeed} onChange={(e) => setMaxSpeed(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" title="Loud Speed" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Maps the volume/beat intensity to device speed.</p>
              </div>

              {/* Sensitivity */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Audio Sensitivity</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{sensitivity}%</span>
                </div>
                <input type="range" min="1" max="100" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Higher sensitivity means quieter sounds trigger faster speeds.</p>
              </div>

              {/* Smoothing / Rate of Change */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Smoothing (Jitter Reduction)</label>
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{smoothing}%</span>
                </div>
                <input type="range" min="0" max="95" value={smoothing} onChange={(e) => setSmoothing(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Smooths out sudden audio spikes to ensure clean, consistent strokes rather than tiny jitters.</p>
              </div>
            </div>
          </div>
          
          <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800">
            <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-2">How it works</h3>
            <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
              When you drop a video, the app quickly extracts and analyzes the entire audio track to build a volume map. As the video plays, it syncs the device speed to this map in real-time. Skipping around perfectly maintains sync!
            </p>
          </div>
        </div>

      </main>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">Audio-Sync Help</h2>
            
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p><strong>What is Audio-Sync?</strong><br/>It analyzes the audio track of your video and instantly adjusts TheHandy's speed to match the volume and beat intensity of the scene.</p>
              
              <p><strong>Stroke Zone:</strong> Limits how far up and down the device moves. 0% is the absolute bottom, 100% is the absolute top.</p>
              
              <p><strong>Speed Mapping:</strong> Set the base speed when it's quiet, and the maximum speed when it's loud.</p>
              
              <p><strong>Smoothing:</strong> Highly recommended. Prevents the device from "stuttering" during rapid audio peaks and creates fluid strokes.</p>
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
