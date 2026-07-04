import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Activity, Power, Zap, Wind, FastForward, Waves } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { checkStatus, setSpeed as apiSetSpeed, setStrokeLength as apiSetStrokeLength } from '../../services/handyService';
import XYPad from './XYPad';

export default function HandyRemote({ isDarkMode, toggleTheme }) {
  const navigate = useNavigate();
  
  const [settings, setSettings] = useState({});
  const [deviceStatus, setDeviceStatus] = useState('Disconnected');
  
  const [speed, setSpeed] = useState(0);
  const [stroke, setStroke] = useState(0);
  
  const lastApiCall = useRef(0);
  const rhythmInterval = useRef(null);
  const [activePreset, setActivePreset] = useState(null);

  // Load Settings
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  // Connection Status Check
  useEffect(() => {
    let interval;
    if (settings.handyKey) {
      setDeviceStatus('Connecting');
      checkStatus(settings.handyKey).then(connected => {
        setDeviceStatus(connected ? 'Connected' : 'Disconnected');
      });

      interval = setInterval(async () => {
        const connected = await checkStatus(settings.handyKey);
        setDeviceStatus(connected ? 'Connected' : 'Disconnected');
      }, 10000);
    } else {
      setDeviceStatus('Disconnected');
    }
    return () => clearInterval(interval);
  }, [settings.handyKey]);

  // Clean up rhythms on unmount
  useEffect(() => {
    return () => stopRhythm();
  }, []);

  const sendToDevice = async (newSpeed, newStroke) => {
    if (!settings.handyKey) return;
    
    // Always update visual state immediately
    setSpeed(newSpeed);
    setStroke(newStroke);
    
    const now = Date.now();
    if (now - lastApiCall.current > 250) {
      lastApiCall.current = now;
      // Note: HAMP requires Stroke before Speed ideally, but we can fire them together
      await apiSetStrokeLength(settings.handyKey, newStroke);
      await apiSetSpeed(settings.handyKey, newSpeed);
    }
  };

  const handleXYChange = (newSpeed, newStroke) => {
    stopRhythm(); // Manual override stops presets
    sendToDevice(newSpeed, newStroke);
  };

  const handleStop = () => {
    stopRhythm();
    sendToDevice(0, 0);
  };

  const stopRhythm = () => {
    if (rhythmInterval.current) {
      clearInterval(rhythmInterval.current);
      rhythmInterval.current = null;
    }
    setActivePreset(null);
  };

  // --- Presets ---

  const presetTease = () => {
    stopRhythm();
    setActivePreset('tease');
    sendToDevice(30, 20); // Low speed, short stroke
  };

  const presetSlowDeep = () => {
    stopRhythm();
    setActivePreset('slowdeep');
    sendToDevice(15, 100); // Slow speed, full stroke
  };

  const presetPounding = () => {
    stopRhythm();
    setActivePreset('pounding');
    sendToDevice(80, 100); // High speed, full stroke
  };

  const presetVibrate = () => {
    stopRhythm();
    setActivePreset('vibrate');
    sendToDevice(100, 5); // Max speed, tiny stroke
  };

  // --- Rhythmic Pattern (Edging Loop) ---
  const presetEdging = () => {
    stopRhythm();
    setActivePreset('edging');
    
    // Edging loop: Ramp up speed slowly for 15s, hold for 2s, stop for 3s
    let ms = 0;
    rhythmInterval.current = setInterval(() => {
      ms += 500;
      if (ms <= 15000) {
        // Ramp up
        const s = Math.round(10 + (ms / 15000) * 80);
        sendToDevice(s, 90);
      } else if (ms <= 17000) {
        // Hold max
        sendToDevice(90, 90);
      } else if (ms <= 20000) {
        // Drop to 0
        sendToDevice(0, 0);
      } else {
        // Loop
        ms = 0;
      }
    }, 500);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white overflow-hidden select-none">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Handy Remote</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Activity size={20} className={deviceStatus === 'Connected' ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'} />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:inline">{deviceStatus}</span>
          </div>
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors border-l pl-4 border-gray-200 dark:border-gray-700">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main Remote Area */}
      <main className="flex-1 flex flex-col justify-between p-4 md:p-8 max-w-2xl mx-auto w-full">
        
        {/* XY Pad */}
        <div className="flex-1 flex items-center justify-center my-4">
          <XYPad 
            currentSpeed={speed} 
            currentStroke={stroke} 
            onChange={handleXYChange} 
          />
        </div>

        {/* Current Status Readout */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <div className="text-center flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Speed</div>
            <div className="text-3xl font-black text-blue-500">{speed}%</div>
          </div>
          <div className="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
          <div className="text-center flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Stroke</div>
            <div className="text-3xl font-black text-purple-500">{stroke}%</div>
          </div>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <button 
            onClick={presetTease}
            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border ${activePreset === 'tease' ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}
          >
            <Wind size={24} className="text-blue-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Tease</span>
          </button>
          
          <button 
            onClick={presetSlowDeep}
            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border ${activePreset === 'slowdeep' ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}
          >
            <Waves size={24} className="text-indigo-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Slow & Deep</span>
          </button>

          <button 
            onClick={presetPounding}
            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border ${activePreset === 'pounding' ? 'bg-orange-100 dark:bg-orange-900 border-orange-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}
          >
            <FastForward size={24} className="text-orange-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Pounding</span>
          </button>

          <button 
            onClick={presetVibrate}
            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border ${activePreset === 'vibrate' ? 'bg-pink-100 dark:bg-pink-900 border-pink-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}
          >
            <Zap size={24} className="text-pink-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Flutter</span>
          </button>

          {/* Rhythmic Preset */}
          <button 
            onClick={presetEdging}
            className={`col-span-2 sm:col-span-1 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border ${activePreset === 'edging' ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}
          >
            <Activity size={24} className="text-emerald-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Edging</span>
          </button>
        </div>

        {/* STOP / PANIC Button */}
        <button 
          onClick={handleStop}
          className="w-full py-6 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-2xl shadow-[0_10px_25px_rgba(220,38,38,0.5)] flex items-center justify-center gap-3 transition-transform active:scale-95"
        >
          <Power size={32} />
          <span className="text-2xl font-black tracking-widest uppercase">Stop</span>
        </button>

      </main>
    </div>
  );
}
