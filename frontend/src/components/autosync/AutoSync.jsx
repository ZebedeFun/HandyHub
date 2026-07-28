import React, { useState, useEffect, useRef } from 'react';
import { getServerTimeOffset, hsspSetup, hsspPlay, hsspStop } from '../../services/handyService';
import { Settings, Music, Loader2, Maximize, Minimize, Activity } from 'lucide-react';
import DeviceSimulator from '../scripter/DeviceSimulator';

export default function AutoSync({ isDarkMode, toggleTheme, settings, openSettings }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  
  // Audio Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioEnvelope, setAudioEnvelope] = useState([]);
  const fps = 20;
  
  // Controls
  const [audioType, setAudioType] = useState('action'); // 'action' or 'music'
  const [minHeight, setMinHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(100);
  const [minSpeed, setMinSpeed] = useState(20);
  const [maxSpeed, setMaxSpeed] = useState(100);
  const [smoothing, setSmoothing] = useState(70);
  const [sensitivity, setSensitivity] = useState(60);
  
  // UI State
  const [showHelp, setShowHelp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isViewingMode, setIsViewingMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Script Generation State
  const [generatedScript, setGeneratedScript] = useState(null);
  
  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);

  // 1. Analyze Audio Buffer
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
      
      for (let i = 0; i < channelData.length; i += blockSize) {
        let sumSquares = 0;
        let count = 0;
        for (let j = 0; j < blockSize && (i + j) < channelData.length; j += 10) {
          sumSquares += channelData[i + j] * channelData[i + j];
          count++;
        }
        envelope.push(Math.sqrt(sumSquares / count));
      }
      
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

  // 2. Generate Script from Envelope when settings change
  useEffect(() => {
    if (audioEnvelope.length === 0) return;
    
    const generateScript = () => {
      const controlTrack = [];
      let currentSpeed = 0;
      
      let actualSmoothing = smoothing;
      if (audioType === 'music') {
        actualSmoothing = Math.max(0, smoothing - 40); // Less smoothing for punchier beats
      }
      const smoothFactor = actualSmoothing / 100;
      
      for (let i = 0; i < audioEnvelope.length; i++) {
        let raw = audioEnvelope[i];
        const multiplier = Math.pow(10, (sensitivity - 50) / 30); 
        raw = Math.min(1.0, raw * multiplier);
        
        if (audioType === 'music' && raw > 0.6) {
           raw = Math.min(1.0, raw * 1.5); // Boost peaks
        }
        
        currentSpeed = (currentSpeed * smoothFactor) + (raw * (1 - smoothFactor));
        controlTrack.push(currentSpeed);
      }
      
      const actions = [];
      let timeMs = 0;
      const maxTimeMs = (audioEnvelope.length / fps) * 1000;
      let isUp = true;
      
      // Enforce 50% minimum stroke range
      let safeMin = minHeight;
      let safeMax = maxHeight;
      if (safeMax - safeMin < 50) {
        if (safeMin + 50 <= 100) safeMax = safeMin + 50;
        else safeMin = safeMax - 50;
      }
      
      while (timeMs < maxTimeMs) {
        const index = Math.floor((timeMs / 1000) * fps);
        const speedVal = index < controlTrack.length ? controlTrack[index] : 0;
        const speedPercent = minSpeed + (speedVal * (maxSpeed - minSpeed));
        
        // Map speed to stroke duration (100% = 150ms, 0% = 2000ms)
        const duration = 150 + ((1 - (speedPercent / 100)) * 1850);
        
        actions.push({
          at: Math.round(timeMs),
          pos: isUp ? safeMax : safeMin
        });
        
        timeMs += duration;
        isUp = !isUp;
      }
      
      return { actions };
    };

    const timer = setTimeout(() => {
      setGeneratedScript(generateScript());
    }, 500); // Debounce script generation
    
    return () => clearTimeout(timer);
  }, [audioEnvelope, minHeight, maxHeight, minSpeed, maxSpeed, sensitivity, smoothing, audioType]);

  // 3. Upload Script to Handy when generatedScript changes AND we are syncing
  useEffect(() => {
    if (!generatedScript || !isSyncing || !settings.handyKey) return;
    
    let isMounted = true;
    const uploadToHandy = async () => {
      setIsUploading(true);
      try {
        const res = await fetch('/api/host-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(generatedScript)
        });
        const data = await res.json();
        
        if (data.success && isMounted) {
          const fullUrl = `${window.location.protocol}//${window.location.host}${data.url}`;
          await hsspSetup(settings.handyKey, fullUrl);
          
          // Re-sync if video is currently playing
          if (videoRef.current && !videoRef.current.paused) {
            const offset = await getServerTimeOffset(settings.handyKey);
            const serverTime = Math.round(Date.now() + offset);
            const startTime = Math.round(videoRef.current.currentTime * 1000);
            await hsspPlay(settings.handyKey, serverTime, startTime);
          }
        }
      } catch (err) {
        console.error("Upload error", err);
      } finally {
        if (isMounted) setIsUploading(false);
      }
    };
    
    const timer = setTimeout(() => {
      uploadToHandy();
    }, 800); // Wait after script is generated before uploading
    
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [generatedScript, isSyncing, settings.handyKey]);

  // Video Handlers
  const handlePlay = async () => {
    setIsPlaying(true);
    if (isSyncing && settings.handyKey && videoRef.current && generatedScript) {
      const offset = await getServerTimeOffset(settings.handyKey);
      const serverTime = Math.round(Date.now() + offset);
      const startTime = Math.round(videoRef.current.currentTime * 1000);
      await hsspPlay(settings.handyKey, serverTime, startTime);
    }
  };

  const handlePause = async () => {
    setIsPlaying(false);
    if (isSyncing && settings.handyKey) {
      await hsspStop(settings.handyKey);
    }
  };

  const handleSeeked = async () => {
    if (isSyncing && settings.handyKey && videoRef.current && !videoRef.current.paused && generatedScript) {
      const offset = await getServerTimeOffset(settings.handyKey);
      const serverTime = Math.round(Date.now() + offset);
      const startTime = Math.round(videoRef.current.currentTime * 1000);
      await hsspPlay(settings.handyKey, serverTime, startTime);
    }
  };

  const toggleSyncing = () => {
    if (isSyncing) {
      setIsSyncing(false);
      hsspStop(settings.handyKey);
    } else {
      if (!settings.handyKey) {
        alert("Please enter a Connection Key in the main Settings first.");
        return;
      }
      setIsSyncing(true);
    }
  };

  // Drag and Drop
  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      analyzeAudio(file);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.name.endsWith('.mp4'))) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      analyzeAudio(file);
    }
  };

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
      
      {!isViewingMode && (
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <a href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600">HandyTime</a>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full text-sm font-semibold flex items-center gap-1">
              <Music size={14} /> Auto-Sync
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowHelp(true)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors text-sm">Help</button>
            <button onClick={toggleTheme} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-lg transition-colors" title="Toggle Theme">
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={openSettings} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-lg transition-colors" title="Settings">
              <Settings size={20} />
            </button>
          </div>
        </header>
      )}

      <main className={isViewingMode ? 'flex-1 w-full h-screen p-0 flex' : 'max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6'}>
        
        {/* Left Col: Video Player */}
        <div className={isViewingMode ? 'w-full h-full relative' : 'lg:col-span-2 space-y-6'}>
          <div className={isViewingMode ? 'w-full h-full flex flex-col' : 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative'}>
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
              <div className={isViewingMode ? "flex-1 bg-black group relative" : "relative w-full h-[60vh] bg-black group"}>
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
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeeked={handleSeeked}
                />
                
                {generatedScript && (
                  <DeviceSimulator 
                    actions={generatedScript.actions}
                    isPlaying={isPlaying}
                    videoRef={videoRef}
                  />
                )}
                
                {!isViewingMode && !isAnalyzing && (
                  <button 
                    onClick={() => setIsViewingMode(true)} 
                    className="absolute top-4 right-4 z-40 bg-black/50 hover:bg-black/80 text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity" 
                    title="Enter Viewing Mode"
                  >
                    <Maximize size={20} />
                  </button>
                )}
                
                {isViewingMode && (
                  <button 
                    onClick={() => setIsViewingMode(false)} 
                    className="absolute top-4 right-4 z-40 bg-black/50 hover:bg-black/80 text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity" 
                    title="Exit Viewing Mode"
                  >
                    <Minimize size={20} />
                  </button>
                )}
              </div>
            )}
            
            {!isViewingMode && videoUrl && !isAnalyzing && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={toggleSyncing}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2 ${isSyncing ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                  >
                    {isSyncing ? '⏹ Stop Syncing' : '▶️ Start Syncing'}
                  </button>
                  <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {isUploading ? (
                      <><Loader2 size={14} className="animate-spin text-blue-500" /> Updating Device...</>
                    ) : (
                      <><span className="w-2 h-2 rounded-full bg-green-500" /> Device Synced</>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-6 text-sm font-mono text-slate-500">
                  {generatedScript && <span>{generatedScript.actions.length} strokes mapped</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Controls */}
        {!isViewingMode && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span>🎛️</span> Script Generator
              </h2>
              
              <div className="space-y-8">
                {/* Audio Type Toggle */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Audio Type</label>
                  </div>
                  <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                    <button 
                      onClick={() => setAudioType('action')} 
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${audioType === 'action' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Continuous (Action)
                    </button>
                    <button 
                      onClick={() => setAudioType('music')} 
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${audioType === 'music' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Punchy (Music)
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Music emphasizes beats. Action creates smoother build-ups.</p>
                </div>

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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Forces full up/down strokes within this range (minimum 50% guaranteed).</p>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Maps volume directly to stroke duration (speed).</p>
                </div>

                {/* Sensitivity */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Audio Sensitivity</label>
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{sensitivity}%</span>
                  </div>
                  <input type="range" min="1" max="100" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Higher sensitivity means quieter sounds trigger faster strokes.</p>
                </div>

                {/* Smoothing / Rate of Change */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Smoothing (Transition Curve)</label>
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">{smoothing}%</span>
                  </div>
                  <input type="range" min="0" max="95" value={smoothing} onChange={(e) => setSmoothing(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Provides smooth transitions between fast and slow strokes based on noise.</p>
                </div>
              </div>
            </div>
            
            <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800">
              <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2"><Activity size={16}/> Smart Pattern Engine</h3>
              <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
                Rather than sending erratic speed commands, Auto-Sync now generates a flawless point-by-point script based on the audio. It ensures complete up/down strokes where the <strong>duration</strong> of each stroke dynamically responds to the noise level.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">Auto-Sync Help</h2>
            
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p><strong>What is Auto-Sync?</strong><br/>It analyzes the audio track of your video and generates a perfect stroke script where speed matches the volume.</p>
              
              <p><strong>Audio Type:</strong> Choose 'Continuous' for smooth buildup in action scenes, or 'Punchy' to hit hard on music beats.</p>
              
              <p><strong>Stroke Zone:</strong> Limits how far up and down the device moves. The engine guarantees strokes are at least 50% of the slider range to ensure meaningful movement.</p>
              
              <p><strong>Speed Mapping:</strong> Set the base speed when it's quiet, and the maximum speed when it's loud.</p>
              
              <p><strong>Smoothing:</strong> Highly recommended. Eases the transitions between quiet and loud moments for a natural vibe.</p>
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
