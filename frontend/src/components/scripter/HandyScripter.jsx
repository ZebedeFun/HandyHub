import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GenerationControls from './GenerationControls';
import Heatmap from './Heatmap';
import DeviceSimulator from './DeviceSimulator';
import { generateProceduralScript } from '../../services/scriptGenerator';

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
  
  const [params, setParams] = useState({
    baseSpeed: 5,
    intensity: 5,
    randomness: 3,
    minStroke: 0,
    maxStroke: 100,
    patternMode: 'consistent',
    blockSizeSec: 0,
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
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setFunscript(null);
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

  // Script Generation
  const handleGenerate = () => {
    if (!durationMs || durationMs === 0) {
      alert("Please wait for the video to load or upload a valid video.");
      return;
    }
    const script = generateProceduralScript(durationMs, params);
    setFunscript(script);
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
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Handy Scripter</h1>
        </div>
        <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col lg:flex-row gap-6">
          
          {/* Left Column: Video & Heatmap */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Video Player Area */}
            <div className="flex-1 bg-black rounded-2xl overflow-hidden relative shadow-lg flex items-center justify-center border border-gray-800">
              {!videoUrl ? (
                <div 
                  className={`text-center p-8 flex flex-col items-center w-full h-full justify-center transition-colors ${isDragging ? 'bg-gray-800/80 border-2 border-blue-500 border-dashed' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
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
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
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

            {/* Heatmap Area */}
            <div className="h-40 shrink-0">
              {funscript ? (
                <Heatmap 
                  actions={funscript.actions} 
                  durationMs={durationMs} 
                  currentTimeMs={currentTimeMs} 
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-300 dark:border-gray-700 border-dashed">
                  <p className="text-gray-500 dark:text-gray-400">Generate a script to see the timeline heatmap</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Controls */}
          <div className="w-full lg:w-80 shrink-0">
            <GenerationControls 
              params={params}
              setParams={setParams}
              onGenerate={handleGenerate}
              canDownload={!!funscript}
              onDownload={handleDownload}
            />
          </div>

        </div>
      </main>
    </div>
  );
}
