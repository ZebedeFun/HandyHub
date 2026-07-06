import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GenerationControls from './GenerationControls';
import Heatmap from './Heatmap';
import DeviceSimulator from './DeviceSimulator';
import ScrollingTimeline from './ScrollingTimeline';
import { generateProceduralScript, generatePartialScript, modifyPartialScript } from '../../services/scriptGenerator';
import { getServerTimeOffset, hsspSetup, hsspPlay, hsspStop } from '../../services/handyService';

export default function HandyScripter({ isDarkMode, toggleTheme }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [funscript, setFunscript] = useState(null);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('handyTimeSettings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [syncToHandy, setSyncToHandy] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(console.error);
  }, []);

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
      setFunscript(null); // clear old script
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
             setFunscript(json);
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
    setFunscript(script);
  };

  const handleRegenerateSelection = (startMs, endMs) => {
    if (!funscript || !funscript.actions) return;
    const newScript = generatePartialScript(funscript.actions, startMs, endMs, params);
    setFunscript(newScript);
  };

  const handleModifySelection = (startMs, endMs, type) => {
    if (!funscript || !funscript.actions) return;
    const newScript = modifyPartialScript(funscript.actions, startMs, endMs, type);
    setFunscript(newScript);
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
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Handy Scripter</h1>
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
            />
          </div>
          
          {/* Middle: Video Player Area */}
          <div className="flex-1 min-h-0 bg-black rounded-2xl overflow-hidden relative shadow-lg flex items-center justify-center border border-gray-800">
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
                {funscript && (
                  <DeviceSimulator 
                    actions={funscript.actions} 
                    isPlaying={isPlaying} 
                    videoRef={videoRef} 
                  />
                )}
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
