import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Activity, Power, Zap, Wind, FastForward, Waves, Shuffle, Feather, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { checkStatus, setSpeed as apiSetSpeed, setStrokeZone as apiSetStrokeZone } from '../../services/handyService';
import XYPad from './XYPad';
import RemoteSimulator from './RemoteSimulator';

export default function HandyRemote({ isDarkMode, toggleTheme }) {
  const navigate = useNavigate();
  
  const [settings, setSettings] = useState({});
  const [deviceStatus, setDeviceStatus] = useState('Disconnected');
  
  // Pad outputs (0-100)
  const [padSpeed, setPadSpeed] = useState(0);
  const [padStroke, setPadStroke] = useState(0);
  
  // Visual readout states
  const [actualSpeed, setActualSpeed] = useState(0);
  const [deviceMin, setDeviceMin] = useState(0);
  const [deviceMax, setDeviceMax] = useState(0);
  
  // Limits & Anchors
  const [limitMinSpeed, setLimitMinSpeed] = useState(0);
  const [limitMaxSpeed, setLimitMaxSpeed] = useState(100);
  const [limitMinDepth, setLimitMinDepth] = useState(0);
  const [limitMaxDepth, setLimitMaxDepth] = useState(100);
  const [anchor, setAnchor] = useState('top');
  
  // Random Mode
  const [randomDuration, setRandomDuration] = useState(10);
  const randomDurationRef = useRef(10);
  
  const padPosRef = useRef({ speed: 0, stroke: 0 });
  const lastApiCall = useRef(0);
  const rhythmInterval = useRef(null);
  const randomState = useRef({ targetX: 50, targetY: 50, startX: 0, startY: 0, startTime: 0 });
  
  const [activePreset, setActivePreset] = useState(null);
  const [testMode, setTestMode] = useState(false);

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

  // Sync randomDuration to ref
  useEffect(() => {
    randomDurationRef.current = randomDuration;
  }, [randomDuration]);

  // Re-calculate and send if limits change while running
  useEffect(() => {
    sendToDevice(padPosRef.current.speed, padPosRef.current.stroke);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitMinSpeed, limitMaxSpeed, limitMinDepth, limitMaxDepth, anchor]);

  const sendToDevice = async (xOut, yOut) => {
    padPosRef.current = { speed: xOut, stroke: yOut };
    
    // 1. Math logic for limits
    const safeMinSpeed = Math.min(limitMinSpeed, limitMaxSpeed);
    const safeMaxSpeed = Math.max(limitMinSpeed, limitMaxSpeed);
    const safeMinDepth = Math.min(limitMinDepth, limitMaxDepth);
    const safeMaxDepth = Math.max(limitMinDepth, limitMaxDepth);

    const targetSpeed = Math.round(safeMinSpeed + (xOut / 100) * (safeMaxSpeed - safeMinSpeed));
    
    let targetMin, targetMax;
    if (anchor === 'top') {
      targetMax = safeMaxDepth;
      targetMin = Math.round(safeMaxDepth - (yOut / 100) * (safeMaxDepth - safeMinDepth));
    } else if (anchor === 'bottom') {
      targetMin = safeMinDepth;
      targetMax = Math.round(safeMinDepth + (yOut / 100) * (safeMaxDepth - safeMinDepth));
    } else { // center
      const center = safeMinDepth + (safeMaxDepth - safeMinDepth) / 2;
      const strokeAmount = (yOut / 100) * (safeMaxDepth - safeMinDepth);
      targetMin = Math.round(center - strokeAmount / 2);
      targetMax = Math.round(center + strokeAmount / 2);
    }

    // Always update visual state immediately
    setPadSpeed(xOut);
    setPadStroke(yOut);
    setActualSpeed(targetSpeed);
    setDeviceMin(targetMin);
    setDeviceMax(targetMax);
    
    if (!settings.handyKey) return;
    
    const now = Date.now();
    if (now - lastApiCall.current > 250) {
      lastApiCall.current = now;
      await apiSetStrokeZone(settings.handyKey, targetMin, targetMax);
      await apiSetSpeed(settings.handyKey, targetSpeed);
    }
  };

  // Keep a ref to the latest sendToDevice function to avoid stale closures in setIntervals
  const sendToDeviceRef = useRef(sendToDevice);
  useEffect(() => {
    sendToDeviceRef.current = sendToDevice;
  });

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
  const presetTease = () => { stopRhythm(); setActivePreset('tease'); sendToDeviceRef.current(30, 20); };
  const presetBlow = () => { stopRhythm(); setActivePreset('blow'); setAnchor('top'); sendToDeviceRef.current(30, 50); };
  const presetSlowDeep = () => { stopRhythm(); setActivePreset('slowdeep'); sendToDeviceRef.current(15, 100); };
  const presetPounding = () => { stopRhythm(); setActivePreset('pounding'); sendToDeviceRef.current(80, 100); };
  const presetVibrate = () => { stopRhythm(); setActivePreset('vibrate'); sendToDeviceRef.current(100, 5); };

  // --- Rhythmic Patterns ---
  const presetMix = () => {
    stopRhythm();
    setActivePreset('mix');
    
    let isDeep = true;
    const mixSpeed = 40; 
    sendToDeviceRef.current(mixSpeed, 100); // Start deep
    
    rhythmInterval.current = setInterval(() => {
      isDeep = !isDeep;
      sendToDeviceRef.current(mixSpeed, isDeep ? 100 : 30);
    }, 5000); // 5 seconds is roughly 5 strokes at 40% speed
  };

  const presetEdging = () => {
    stopRhythm();
    setActivePreset('edging');
    
    let ms = 0;
    const cycleDuration = 20000; // 20 seconds per full cycle
    
    rhythmInterval.current = setInterval(() => {
      ms += 500;
      const progress = (ms % cycleDuration) / cycleDuration;
      const strokeMultiplier = (1 - Math.cos(progress * Math.PI * 2)) / 2;
      const currentPadStroke = Math.round(20 + strokeMultiplier * 80);
      const padSpeedOut = 30;
      
      sendToDeviceRef.current(padSpeedOut, currentPadStroke);
    }, 500);
  };

  // --- Random Pattern ---
  const triggerNextRandom = () => {
    randomState.current = {
      targetX: Math.random() * 100,
      targetY: Math.random() * 100,
      startX: padPosRef.current.speed,
      startY: padPosRef.current.stroke,
      state: 'BLENDING',
      stateStartTime: Date.now()
    };
  };

  const presetRandom = () => {
    if (activePreset === 'random') {
      triggerNextRandom(); // Force skip to next random target immediately
      return;
    }
    
    stopRhythm();
    setActivePreset('random');
    triggerNextRandom();
    
    const BLEND_DURATION_MS = 3000; // Fixed 3 second transition
    
    rhythmInterval.current = setInterval(() => {
      const { startX, startY, targetX, targetY, state, stateStartTime } = randomState.current;
      const holdDurationMs = randomDurationRef.current * 1000;
      
      const now = Date.now();
      
      if (state === 'BLENDING') {
        let progress = (now - stateStartTime) / BLEND_DURATION_MS;
        
        if (progress >= 1) {
          progress = 1;
          randomState.current.state = 'HOLDING';
          randomState.current.stateStartTime = now;
        }
        
        // Easing function (easeInOutQuad) for smooth blending
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const newX = startX + (targetX - startX) * ease;
        const newY = startY + (targetY - startY) * ease;
        sendToDeviceRef.current(newX, newY);
      } else if (state === 'HOLDING') {
        // Just wait until the hold duration expires, then pick a new target
        if (now - stateStartTime >= holdDurationMs) {
          triggerNextRandom();
        }
      }
    }, 250);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white select-none">
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
          <button 
            onClick={() => setTestMode(!testMode)} 
            className={`px-3 py-1 text-sm font-bold rounded-full border transition-colors hidden sm:block ${testMode ? 'bg-emerald-100 border-emerald-500 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-400 dark:text-emerald-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}
          >
            {testMode ? 'Test Mode: ON' : 'Test Mode: OFF'}
          </button>
          {/* Mobile Test Mode Toggle */}
          <button 
            onClick={() => setTestMode(!testMode)} 
            className={`p-2 rounded-full border transition-colors sm:hidden ${testMode ? 'bg-emerald-100 border-emerald-500 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-400 dark:text-emerald-400' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}
            title="Test Mode"
          >
            <Wind size={20} />
          </button>
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors border-l pl-4 border-gray-200 dark:border-gray-700">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main Remote Area */}
      <main className="flex-1 flex flex-col p-4 md:p-8 max-w-3xl mx-auto w-full">
        
        {/* XY Pad */}
        <div className="flex-1 flex items-center justify-center my-4 min-h-[250px]">
          <XYPad 
            currentSpeed={padSpeed} 
            currentStroke={padStroke} 
            onChange={handleXYChange} 
          />
        </div>

        {/* Current Status Readout */}
        {testMode && (
          <RemoteSimulator speed={actualSpeed} deviceMin={deviceMin} deviceMax={deviceMax} />
        )}

        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mt-2 mb-6">
          <div className="text-center flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Out Speed</div>
            <div className="text-2xl font-black text-blue-500">{actualSpeed}%</div>
          </div>
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700"></div>
          <div className="text-center flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Out Min</div>
            <div className="text-2xl font-black text-purple-500">{deviceMin}%</div>
          </div>
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700"></div>
          <div className="text-center flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Out Max</div>
            <div className="text-2xl font-black text-purple-500">{deviceMax}%</div>
          </div>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <button onClick={presetTease} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'tease' ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Feather size={20} className="text-blue-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Tease</span>
          </button>
          <button onClick={presetBlow} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'blow' ? 'bg-cyan-100 dark:bg-cyan-900 border-cyan-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Wind size={20} className="text-cyan-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Blow</span>
          </button>
          <button onClick={presetSlowDeep} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'slowdeep' ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Waves size={20} className="text-indigo-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Slow Deep</span>
          </button>
          <button onClick={presetPounding} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'pounding' ? 'bg-orange-100 dark:bg-orange-900 border-orange-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <FastForward size={20} className="text-orange-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Pounding</span>
          </button>
          <button onClick={presetVibrate} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'vibrate' ? 'bg-pink-100 dark:bg-pink-900 border-pink-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Zap size={20} className="text-pink-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Flutter</span>
          </button>
          <button onClick={presetEdging} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'edging' ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Activity size={20} className="text-emerald-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Edging</span>
          </button>
          <button onClick={presetMix} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'mix' ? 'bg-teal-100 dark:bg-teal-900 border-teal-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <RefreshCw size={20} className="text-teal-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Mix</span>
          </button>
          <button onClick={presetRandom} className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${activePreset === 'random' ? 'bg-amber-100 dark:bg-amber-900 border-amber-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
            <Shuffle size={20} className="text-amber-500" />
            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Random</span>
          </button>
        </div>

        {/* Random Settings (Visible only when Random is active) */}
        {activePreset === 'random' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800 mb-4 flex flex-col sm:flex-row items-center gap-4">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">Blend Every:</span>
            <input type="range" min="2" max="60" value={randomDuration} onChange={e => setRandomDuration(Number(e.target.value))} className="w-full accent-amber-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap w-12 text-right">{randomDuration} sec</span>
          </div>
        )}

        {/* STOP / PANIC Button */}
        <button 
          onClick={handleStop}
          className="w-full py-6 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-2xl shadow-[0_10px_25px_rgba(220,38,38,0.5)] flex items-center justify-center gap-3 transition-transform active:scale-95 mb-10"
        >
          <Power size={32} />
          <span className="text-2xl font-black tracking-widest uppercase">Stop</span>
        </button>

        {/* Limits Configuration */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 opacity-80 hover:opacity-100 transition-opacity">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Device Limits</h3>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg">
              <button onClick={() => setAnchor('top')} className={`px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-shadow ${anchor === 'top' ? 'bg-white dark:bg-gray-700 shadow text-purple-500' : 'text-gray-500'}`}>Top-Down</button>
              <button onClick={() => setAnchor('center')} className={`px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-shadow ${anchor === 'center' ? 'bg-white dark:bg-gray-700 shadow text-purple-500' : 'text-gray-500'}`}>Center</button>
              <button onClick={() => setAnchor('bottom')} className={`px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-shadow ${anchor === 'bottom' ? 'bg-white dark:bg-gray-700 shadow text-purple-500' : 'text-gray-500'}`}>Bottom-Up</button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <div>
              <label className="flex justify-between text-xs font-bold text-gray-500 mb-2"><span>Min Depth</span><span>{limitMinDepth}%</span></label>
              <input type="range" min="0" max="100" value={limitMinDepth} onChange={e => setLimitMinDepth(Number(e.target.value))} className="w-full accent-purple-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-bold text-gray-500 mb-2"><span>Max Depth</span><span>{limitMaxDepth}%</span></label>
              <input type="range" min="0" max="100" value={limitMaxDepth} onChange={e => setLimitMaxDepth(Number(e.target.value))} className="w-full accent-purple-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-bold text-gray-500 mb-2"><span>Min Speed</span><span>{limitMinSpeed}%</span></label>
              <input type="range" min="0" max="100" value={limitMinSpeed} onChange={e => setLimitMinSpeed(Number(e.target.value))} className="w-full accent-blue-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-bold text-gray-500 mb-2"><span>Max Speed</span><span>{limitMaxSpeed}%</span></label>
              <input type="range" min="0" max="100" value={limitMaxSpeed} onChange={e => setLimitMaxSpeed(Number(e.target.value))} className="w-full accent-blue-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
