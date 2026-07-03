import React from 'react';
import { Settings, Play, Download } from 'lucide-react';

export default function GenerationControls({ params, setParams, onGenerate, canDownload, onDownload }) {
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    
    // For selects, value is string. For range, parse to int
    let parsedValue = type === 'range' ? parseInt(value, 10) : value;
    
    // Ensure minStroke <= maxStroke
    if (name === 'minStroke' && parsedValue > params.maxStroke) parsedValue = params.maxStroke;
    if (name === 'maxStroke' && parsedValue < params.minStroke) parsedValue = params.minStroke;

    setParams(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
        <Settings className="text-blue-500" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Script Parameters</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        
        {/* Pattern Mode */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Pattern Mode</label>
          <select 
            name="patternMode" 
            value={params.patternMode} 
            onChange={handleChange}
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none transition-colors"
          >
            <option value="consistent">Consistent</option>
            <option value="build">Build Over Time</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {params.patternMode === 'build' ? 'Starts slow and soft, building up to your chosen speed/intensity.' : 'Maintains the chosen speed and intensity throughout.'}
          </p>
        </div>

        {/* Block Size */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Block Size</label>
            <span className="text-sm text-gray-500">{params.blockSizeSec === 0 ? 'Off' : `${params.blockSizeSec}s`}</span>
          </div>
          <input 
            type="range" min="0" max="60" name="blockSizeSec" 
            value={params.blockSizeSec} onChange={handleChange}
            className="w-full accent-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Holds a consistent speed/stroke for this duration before switching.</p>
        </div>

        {/* Base Speed */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Base Speed</label>
            <span className="text-sm text-gray-500">{params.baseSpeed}</span>
          </div>
          <input 
            type="range" min="1" max="10" name="baseSpeed" 
            value={params.baseSpeed} onChange={handleChange}
            className="w-full accent-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Overall pacing of strokes (1 = Slow, 10 = Fast)</p>
        </div>

        {/* Intensity */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Intensity</label>
            <span className="text-sm text-gray-500">{params.intensity}</span>
          </div>
          <input 
            type="range" min="1" max="10" name="intensity" 
            value={params.intensity} onChange={handleChange}
            className="w-full accent-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">How far the strokes travel (1 = Short bursts, 10 = Full sweeps)</p>
        </div>

        {/* Randomness */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Chaos / Randomness</label>
            <span className="text-sm text-gray-500">{params.randomness}</span>
          </div>
          <input 
            type="range" min="0" max="10" name="randomness" 
            value={params.randomness} onChange={handleChange}
            className="w-full accent-emerald-500"
          />
          <p className="text-xs text-gray-500 mt-1">Variance in timing and position (0 = Steady, 10 = Erratic)</p>
        </div>

        {/* Min / Max Stroke Range */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Position Limits (%)</label>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <span className="text-xs text-gray-500 mb-1 block">Min (Bottom): {params.minStroke}%</span>
              <input 
                type="range" min="0" max="100" name="minStroke" 
                value={params.minStroke} onChange={handleChange}
                className="w-full accent-gray-500"
              />
            </div>
            <div className="flex-1">
              <span className="text-xs text-gray-500 mb-1 block">Max (Top): {params.maxStroke}%</span>
              <input 
                type="range" min="0" max="100" name="maxStroke" 
                value={params.maxStroke} onChange={handleChange}
                className="w-full accent-gray-500"
              />
            </div>
          </div>
        </div>

      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <button 
          onClick={onGenerate}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
        >
          <Play size={18} />
          Generate Script
        </button>
        
        <button 
          onClick={onDownload}
          disabled={!canDownload}
          className={`w-full py-3 px-4 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 ${
            canDownload 
              ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600' 
              : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-transparent'
          }`}
        >
          <Download size={18} />
          Download .funscript
        </button>
      </div>

    </div>
  );
}
