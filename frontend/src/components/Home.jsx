import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Video, Settings } from 'lucide-react';

export default function Home({ isDarkMode, toggleTheme, openSettings }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white flex flex-col items-center justify-center p-6">
      
      {/* Header controls */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <button 
          onClick={toggleTheme} 
          className="p-3 bg-white dark:bg-gray-800 shadow-md rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
        <button 
          onClick={openSettings} 
          className="p-3 bg-white dark:bg-gray-800 shadow-md rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Settings size={20} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      <div className="text-center mb-16">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
          Handy Hub
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-lg mx-auto">
          Choose your experience. Engage in interactive chat or generate custom scripts from your videos.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl w-full">
        {/* Handy Time Card */}
        <button 
          onClick={() => navigate('/chat')}
          className="group relative bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-100 dark:border-gray-700 overflow-hidden text-left"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 to-rose-500"></div>
          <div className="bg-pink-100 dark:bg-pink-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-pink-500 dark:text-pink-400 group-hover:scale-110 transition-transform">
            <MessageSquare size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-3">AI Partner</h2>
          <p className="text-gray-600 dark:text-gray-400">
            An interactive chat experience with your AI companion that physically connects with your device.
          </p>
        </button>

        {/* Handy Scripter Card */}
        <button 
          onClick={() => navigate('/scripter')}
          className="group relative bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-100 dark:border-gray-700 overflow-hidden text-left"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <div className="bg-blue-100 dark:bg-blue-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform">
            <Video size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-3">Handy Scripter</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Upload a video and procedurally generate a funscript file to synchronize your device.
          </p>
        </button>

        {/* Handy Remote Card */}
        <button 
          onClick={() => navigate('/remote')}
          className="group relative bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-100 dark:border-gray-700 overflow-hidden text-left"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
          <div className="bg-emerald-100 dark:bg-emerald-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="12" height="20" x="6" y="2" rx="2"/><circle cx="12" cy="18" r="2"/><circle cx="12" cy="8" r="1.5"/></svg>
          </div>
          <h2 className="text-2xl font-bold mb-3">Handy Remote</h2>
          <p className="text-gray-600 dark:text-gray-400">
            A distraction-free, one-touch remote control with gestures and rhythm presets.
          </p>
        </button>

        {/* Auto Sync Card */}
        <button 
          onClick={() => navigate('/autosync')}
          className="group relative bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-100 dark:border-gray-700 overflow-hidden text-left"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 to-orange-500"></div>
          <div className="bg-amber-100 dark:bg-amber-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform">
            <Video size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-3">Auto Sync</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time visual motion tracking that automatically matches device speed to the video.
          </p>
        </button>
      </div>
    </div>
  );
}
