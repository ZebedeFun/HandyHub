import React from 'react';
import { Settings, Play, Download, Activity, Sliders, Timer, Zap } from 'lucide-react';

export default function GenerationControls({ params, setParams, onGenerate, canDownload, onDownload }) {
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    
    // For selects, value is string. For range, parse to int
    let parsedValue = type === 'range' ? parseInt(value, 10) : value;
    
    // Ensure minStroke <= maxStroke
    if (name === 'minStroke' && parsedValue > params.maxStroke) parsedValue = params.maxStroke;
    if (name === 'maxStroke' && parsedValue < params.minStroke) parsedValue = params.minStroke;
    
    // Ensure minStrokeLength <= maxStrokeLength
    if (name === 'minStrokeLength' && parsedValue > params.maxStrokeLength) parsedValue = params.maxStrokeLength;
    if (name === 'maxStrokeLength' && parsedValue < params.minStrokeLength) parsedValue = params.minStrokeLength;

    setParams(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const SectionTitle = ({ icon: Icon, title }) => (
    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
      <Icon size={16} className="text-blue-500" />
      {title}
    </h3>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3 shrink-0">
        <Settings className="text-blue-500" />
        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Script Parameters</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        
        {/* Section 1: Behavior */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Activity} title="Behavior" />
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Pattern Mode</label>
              <select 
                name="patternMode" 
                value={params.patternMode} 
                onChange={handleChange}
                className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none"
              >
                <option value="consistent">Consistent</option>
                <option value="build">Build Over Time</option>
                <option value="random">Random Phases</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Block Size</label>
                <span className="text-xs font-mono text-blue-500">{params.blockSizeSec === 0 ? 'Off' : `${params.blockSizeSec}s`}</span>
              </div>
              <input 
                type="range" min="0" max="60" name="blockSizeSec" 
                value={params.blockSizeSec} onChange={handleChange}
                className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Rhythm & Intensity */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Zap} title="Rhythm & Intensity" />
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Base Speed</label>
                <span className="text-xs font-mono text-blue-500">{params.baseSpeed}</span>
              </div>
              <input 
                type="range" min="1" max="10" name="baseSpeed" 
                value={params.baseSpeed} onChange={handleChange}
                className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Min Length</label>
                  <span className="text-[10px] font-mono text-purple-500">{params.minStrokeLength}%</span>
                </div>
                <input 
                  type="range" min="5" max="100" name="minStrokeLength" 
                  value={params.minStrokeLength} onChange={handleChange}
                  className="w-full accent-purple-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max Length</label>
                  <span className="text-[10px] font-mono text-purple-500">{params.maxStrokeLength}%</span>
                </div>
                <input 
                  type="range" min="5" max="100" name="maxStrokeLength" 
                  value={params.maxStrokeLength} onChange={handleChange}
                  className="w-full accent-purple-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Chaos / Randomness</label>
                <span className="text-xs font-mono text-emerald-500">{params.randomness}</span>
              </div>
              <input 
                type="range" min="0" max="10" name="randomness" 
                value={params.randomness} onChange={handleChange}
                className="w-full accent-emerald-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Limits & Zones */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Sliders} title="Limits & Zones" />
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Min (Bot)</span>
                <input 
                  type="range" min="0" max="100" name="minStroke" 
                  value={params.minStroke} onChange={handleChange}
                  className="w-full accent-gray-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 mt-1 block text-right">{params.minStroke}%</span>
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Max (Top)</span>
                <input 
                  type="range" min="0" max="100" name="maxStroke" 
                  value={params.maxStroke} onChange={handleChange}
                  className="w-full accent-gray-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 mt-1 block text-right">{params.maxStroke}%</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between mb-1 flex-wrap gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Timer size={12} /> Cooldown End Zone
                </label>
                <span className="text-xs font-mono text-cyan-500">{params.cooldownSec === 0 ? 'None' : `${params.cooldownSec}s`}</span>
              </div>
              <input 
                type="range" min="0" max="300" step="10" name="cooldownSec" 
                value={params.cooldownSec} onChange={handleChange}
                className="w-full accent-cyan-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-1"
              />
              <p className="text-[10px] text-gray-500 mt-1 leading-tight">Drops speed and intensity to minimum for the final {params.cooldownSec > 0 ? params.cooldownSec : 'N'} seconds of the video.</p>
            </div>
          </div>
        </div>

      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2 shrink-0">
        <button 
          onClick={onGenerate}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
        >
          <Play size={16} />
          Generate Script
        </button>
        
        <button 
          onClick={onDownload}
          disabled={!canDownload}
          className={`w-full py-2.5 px-4 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 ${
            canDownload 
              ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600' 
              : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-transparent'
          }`}
        >
          <Download size={16} />
          Download .funscript
        </button>
      </div>

    </div>
  );
}
