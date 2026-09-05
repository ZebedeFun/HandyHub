import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Upload, Settings, Maximize, Minimize } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GenerationControls from './GenerationControls';
import Heatmap from './Heatmap';
import DeviceSimulator from './DeviceSimulator';
import ScrollingTimeline from './ScrollingTimeline';
import { generateProceduralScript, generatePartialScript, modifyPartialScript } from '../../services/scriptGenerator';
import { getServerTimeOffset, hsspSetup, hsspPlay, hsspStop } from '../../services/handyService';

export default function HandyScripter({ isDarkMode, toggleTheme, settings, openSettings }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Undo/redo. Every edit here (regenerate a range, nudge it faster, strip
  // jitter, delete a point) is destructive and can undo a lot of fiddling, so
  // each mutation goes through commitFunscript.
  //
  // past/present/future live in ONE state object on purpose: driving three
  // separate states meant calling setState from inside another state's updater,
  // which React is free to invoke more than once, and the stacks desynced.
  const MAX_HISTORY = 50;
  const [history, setHistory] = useState({ past: [], present: null, future: [] });
  const funscript = history.present;

  const commitFunscript = (next) => setHistory(h => ({
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
  }));

  // Starting over (a new video) drops the history rather than adding to it.
  const resetFunscript = (next) => setHistory({ past: [], present: next, future: [] });

  const undo = () => setHistory(h => h.past.length === 0 ? h : ({
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  }));

  const redo = () => setHistory(h => h.future.length === 0 ? h : ({
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present: h.future[0],
    future: h.future.slice(1),
  }));

  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing in a field.
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const [syncToHandy, setSyncToHandy] = useState(false);
  const [isViewingMode, setIsViewingMode] = useState(false);

  const syncScriptToHandy = async (scriptJson) => {
    if (!settings.handyKey || !scriptJson) return;
    try {
      const res = await fetch('/api/host-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptJson)
      });
      const data = await res.json();
      if (data.success) {
        const fullUrl = `${window.location.protocol}//${window.location.host}${data.url}`;
        await hsspSetup(settings.handyKey, fullUrl);
      }
    } catch (err) {
      console.error('Handy Sync error:', err);
    }
  };

  useEffect(() => {
    if (syncToHandy && funscript) {
      syncScriptToHandy(funscript);
    }
  }, [funscript, syncToHandy]);
  
  const [params, setParams] = useState({
    baseSpeed: 5,
    strokesPerMin: 200,
    minStrokeLength: 10,
    maxStrokeLength: 100,
    randomness: 3,
    minStroke: 0,
    maxStroke: 100,
    patternMode: 'consistent',
    blockSizeSec: 0,
    transitionSec: 0,
    cooldownSec: 0
  });

  // Handle Video Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      resetFunscript(null); // clear old script
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
    } else if (file.name.endsWith('.funscript') || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          if (json.actions) {
             commitFunscript(json);
             if (!videoUrl && json.actions.length > 0) {
               setDurationMs(json.actions[json.actions.length - 1].at + 1000);
             }
          } else {
             alert("Invalid funscript format");
          }
        } catch (err) {
          alert("Could not parse funscript file");
        }
      };
      reader.readAsText(file);
    }
  };

  // Video Events
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDurationMs(videoRef.current.duration * 1000);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTimeMs(videoRef.current.currentTime * 1000);
    }
  };

  const handlePlay = async () => {
    setIsPlaying(true);
    if (syncToHandy && settings.handyKey && videoRef.current) {
      const offset = await getServerTimeOffset(settings.handyKey);
      const serverTime = Math.round(Date.now() + offset);
      const startTime = Math.round(videoRef.current.currentTime * 1000);
      await hsspPlay(settings.handyKey, serverTime, startTime);
    }
  };

  const handlePause = async () => {
    setIsPlaying(false);
    if (syncToHandy && settings.handyKey) {
      await hsspStop(settings.handyKey);
    }
  };

  const handleSeeked = async () => {
    if (isPlaying && syncToHandy && settings.handyKey && videoRef.current) {
      const offset = await getServerTimeOffset(settings.handyKey);
      const serverTime = Math.round(Date.now() + offset);
      const startTime = Math.round(videoRef.current.currentTime * 1000);
      await hsspPlay(settings.handyKey, serverTime, startTime);
    }
  };

  // Script Generation
  const handleGenerate = () => {
    if (!durationMs || durationMs === 0) {
      alert("Please wait for the video to load or upload a valid video.");
      return;
    }
    const script = generateProceduralScript(durationMs, params);
    commitFunscript(script);
  };

  const handleRegenerateSelection = (startMs, endMs) => {
    if (!funscript || !funscript.actions) return;
    const newScript = generatePartialScript(funscript.actions, startMs, endMs, params);
    commitFunscript(newScript);
  };

  const handleModifySelection = (startMs, endMs, type) => {
    if (!funscript || !funscript.actions) return;
    const newScript = modifyPartialScript(funscript.actions, startMs, endMs, type);
    commitFunscript(newScript);
  };

  const handleFixJitterWholeScript = () => {
    if (!funscript || !funscript.actions || !durationMs) return;
    const newScript = modifyPartialScript(funscript.actions, 0, durationMs, 'jitter');
    commitFunscript(newScript);
  };

  const handleRemovePoint = (timeMs) => {
    if (!funscript || !funscript.actions) return;
    
    let nearestIdx = -1;
    let minDiff = Infinity;
    for (let i = 0; i < funscript.actions.length; i++) {
       const diff = Math.abs(funscript.actions[i].at - timeMs);
       if (diff < minDiff && diff < 1000) {
          minDiff = diff;
          nearestIdx = i;
       }
    }
    
    if (nearestIdx !== -1) {
       if (nearestIdx === 0 || nearestIdx === funscript.actions.length - 1) return;
       const newActions = [...funscript.actions];
       newActions.splice(nearestIdx, 1);
       commitFunscript({ ...funscript, actions: newActions });
    }
  };

  // Download logic
  const handleDownload = () => {
    if (!funscript || !videoFile) return;

    const json = JSON.stringify(funscript, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    
    // Suggest a filename based on video
    const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
    
    const link = document.createElement("a");
    link.href = href;
    link.download = `${baseName}.funscript`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  return (
    <div 
      className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white relative"
      onDragOver={handleDragOver}
    >
      {/* Global Drag Overlay */}
      {isDragging && (
        <div 
          className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-blue-500 border-dashed"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center pointer-events-none">
            <Upload size={48} className="text-blue-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Drop File Here</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-center max-w-sm">
              Drop an MP4 video or a .funscript file anywhere to load it.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Handy Scripter</h1>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center space-x-2 text-sm cursor-pointer border-r pr-4 border-gray-200 dark:border-gray-700">
            <input 
              type="checkbox" 
              checked={syncToHandy} 
              onChange={(e) => {
                if (e.target.checked && !settings.handyKey) {
                  alert("Please set your Handy Connection Key in the Chat Settings first.");
                  return;
                }
                setSyncToHandy(e.target.checked);
              }} 
              className="rounded text-blue-500 focus:ring-blue-500" 
            />
            <span className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">Sync to Handy</span>
          </label>
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={openSettings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <Settings size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
        <div className="max-w-[100rem] mx-auto h-full flex flex-col gap-6">
          
          {/* Top: Controls */}
          <div className="w-full shrink-0">
            <GenerationControls 
              params={params}
              setParams={setParams}
              onGenerate={handleGenerate}
              canDownload={!!funscript}
              onDownload={handleDownload}
              onFixJitterWholeScript={handleFixJitterWholeScript}
              onUndo={undo}
              onRedo={redo}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
            />
          </div>
          
          {/* Middle: Video Player Area */}
          <div className={isViewingMode ? "fixed inset-0 z-50 bg-black flex flex-row group" : "flex-1 min-h-0 bg-black rounded-2xl overflow-hidden relative shadow-lg flex flex-row border border-gray-800 group"}>
            {!videoUrl ? (
              <div 
                className={`text-center p-8 flex flex-col items-center w-full h-full justify-center transition-colors`}
              >
                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4 pointer-events-none">
                  <Upload size={32} className="text-blue-500" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2 pointer-events-none">Upload a Video</h3>
                <p className="text-gray-400 mb-6 max-w-sm pointer-events-none">Select an MP4 video from your device or drag and drop it here to begin generating a synchronized funscript.</p>
                
                <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-full font-medium transition-colors z-10">
                  Browse Files
                  <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            ) : (
              <>
                {funscript && (
                  <div className="w-20 bg-gray-900 border-r border-gray-800 relative shrink-0">
                    <DeviceSimulator 
                      actions={funscript.actions} 
                      isPlaying={isPlaying} 
                      videoRef={videoRef} 
                      className="absolute inset-y-4 inset-x-0 flex justify-center pointer-events-none drop-shadow-2xl opacity-90"
                    />
                  </div>
                )}
                
                <div className="flex-1 relative flex items-center justify-center">
                  <video 
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full h-full object-contain"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onSeeked={handleSeeked}
                  />
                  
                  {!isViewingMode && (
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
              </>
            )}
          </div>

          {/* Bottom: Heatmap Area */}
          <div className="flex flex-col gap-4 shrink-0 w-full pb-4">
            {funscript ? (
              <>
                <ScrollingTimeline 
                  actions={funscript.actions} 
                  currentTimeMs={currentTimeMs} 
                  isPlaying={isPlaying}
                  videoRef={videoRef}
                  onRemovePoint={handleRemovePoint}
                />
                <div className="h-40">
                  <Heatmap 
                    actions={funscript.actions} 
                    durationMs={durationMs} 
                    currentTimeMs={currentTimeMs} 
                    onRegenerateSelection={handleRegenerateSelection}
                    onModifySelection={handleModifySelection}
                  />
                </div>
              </>
            ) : (
              <div className="w-full h-40 bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-300 dark:border-gray-700 border-dashed">
                <p className="text-gray-500 dark:text-gray-400">Generate a script to see the timeline heatmap</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
