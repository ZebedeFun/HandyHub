import React from 'react';
import { Settings, Play, Download, Activity, Sliders, Timer, Zap, Wand2, Undo2, Redo2, ChevronDown, ChevronUp, Music, Volume2, Loader2 } from 'lucide-react';

export default function GenerationControls({ params, setParams, onGenerate, canDownload, onDownload, onFixJitterWholeScript, onUndo, onRedo, canUndo, canRedo, collapsed, onToggleCollapsed, mode, setMode, audioParams, setAudioParams, isAnalyzingAudio, hasVideo }) {
  const isAudio = mode === 'audio';

  // Audio mode needs a soundtrack to read; without a video there is nothing to
  // generate from.
  const canGenerate = !isAnalyzingAudio && (!isAudio || hasVideo);

  const handleAudioChange = (name, value) => setAudioParams(prev => {
    const next = { ...prev, [name]: value };
    // Keep each pair the right way round, as the procedural sliders do.
    if (name === 'minHeight' && next.minHeight > next.maxHeight) next.maxHeight = next.minHeight;
    if (name === 'maxHeight' && next.maxHeight < next.minHeight) next.minHeight = next.maxHeight;
    if (name === 'minSpeed' && next.minSpeed > next.maxSpeed) next.maxSpeed = next.minSpeed;
    if (name === 'maxSpeed' && next.maxSpeed < next.minSpeed) next.minSpeed = next.maxSpeed;
    return next;
  });

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

  // One-line explanation under each control. Shown always rather than on hover:
  // the panel scrolls, so a popup would be clipped, and hover tooltips are
  // useless on a tablet.
  const Hint = ({ children, low, high }) => (
    <div className="mt-1 leading-tight">
      <p className="text-[10px] text-gray-500 dark:text-gray-400">{children}</p>
      {(low || high) && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 flex justify-between gap-2 mt-0.5">
          <span>← {low}</span>
          <span className="text-right">{high} →</span>
        </p>
      )}
    </div>
  );

  const SectionTitle = ({ icon: Icon, title }) => (
    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
      <Icon size={16} className="text-blue-500" />
      {title}
    </h3>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 w-full flex flex-col">
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 ${collapsed ? '' : 'mb-4 pb-3 border-b border-gray-100 dark:border-gray-700'}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show the script parameters' : 'Hide the script parameters to give the video more room'}
          className="flex items-center gap-2 -ml-1 px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
        >
          <Settings className="text-blue-500" />
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Script Parameters</h2>
          {collapsed
            ? <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />
            : <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" />}
        </button>

        <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('procedural')}
            title="Build a script from the parameters below"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              !isAudio
                ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Sliders size={14} /> Parameters
          </button>
          <button
            type="button"
            onClick={() => setMode('audio')}
            title="Build a script from the loaded video's soundtrack"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              isAudio
                ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Music size={14} /> Audio
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={onGenerate}
            disabled={!canGenerate}
            title={isAudio && !hasVideo ? 'Load a video first — Audio mode reads its soundtrack' : undefined}
            className={`py-2 px-4 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
              canGenerate
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-0.5'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed shadow-none'
            }`}
          >
            {isAnalyzingAudio ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isAnalyzingAudio
              ? 'Analyzing Audio…'
              : isAudio ? 'Generate from Audio' : 'Generate Complete Script'}
          </button>
          
          <div className="flex items-center gap-1 mr-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className={`p-2 rounded-xl border transition-all ${
                canUndo
                  ? 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed border-transparent'
              }`}
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className={`p-2 rounded-xl border transition-all ${
                canRedo
                  ? 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed border-transparent'
              }`}
            >
              <Redo2 size={16} />
            </button>
          </div>

          <button
            onClick={onFixJitterWholeScript}
            disabled={!canDownload}
            title="Remove minor jitters from the entire script"
            className={`py-2 px-4 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 ${
              canDownload 
                ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50' 
                : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-transparent'
            }`}
          >
            <Wand2 size={16} />
            Fix All Jitters
          </button>
          
          <button 
            onClick={onDownload}
            disabled={!canDownload}
            className={`py-2 px-4 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 ${
              canDownload 
                ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600' 
                : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-transparent'
            }`}
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>

      {!collapsed && !isAudio && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        
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
              <Hint>
                <b>Consistent</b> holds one intensity throughout. <b>Build Over Time</b> starts slow and shallow
                and ramps up to your maximums by the end. <b>Random Phases</b> re-rolls speed, length and depth
                every block for an unpredictable ride.
              </Hint>
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
              <Hint low="Off: a new feel every stroke, restless" high="60s: long, settled passages">
                How long the script keeps one feel before picking fresh settings.
              </Hint>
            </div>

            {params.blockSizeSec > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50 mt-2">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Transition Smoothing</label>
                  <span className="text-xs font-mono text-blue-500">{params.transitionSec === 0 ? 'Instant' : `${params.transitionSec}s`}</span>
                </div>
                <input 
                  type="range" min="0" max="10" name="transitionSec" 
                  value={params.transitionSec} onChange={handleChange}
                  className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Hint low="Instant: abrupt gear-change" high="10s: slow, seamless drift">
                  How long it takes to morph into the next block instead of switching abruptly.
                </Hint>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Rhythm & Intensity */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Zap} title="Rhythm & Intensity" />
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Tempo</label>
                <span className="text-xs font-mono text-blue-500">{params.strokesPerMin}/min</span>
              </div>
              <input
                type="range" min="30" max="400" step="10" name="strokesPerMin"
                value={params.strokesPerMin} onChange={handleChange}
                className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <Hint low="30/min: long, slow strokes" high="400/min: rapid pumping">
                Direction changes per minute. Sets the rhythm on its own, so changing stroke length no longer
                changes the pace.
              </Hint>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max Speed Limit</label>
                <span className="text-xs font-mono text-blue-500">{params.baseSpeed}</span>
              </div>
              <input
                type="range" min="1" max="10" name="baseSpeed"
                value={params.baseSpeed} onChange={handleChange}
                className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <Hint low="1: gentle; long strokes stretch out" high="10: full device speed">
                A ceiling on carriage speed, not the pace itself. If a long stroke cannot be finished in time,
                the tempo eases off to respect it.
              </Hint>
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
                <Hint low="5%: allows tiny teasing flicks" high="100%: never shorter than a full stroke" />
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
                <Hint low="Caps how long a stroke may get" high="100%: full-range strokes allowed" />
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
              <Hint low="0: metronome-steady" high="10: constantly shifting rhythm">
                Jitters tempo, stroke length and speed away from their set values.
              </Hint>
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
                <Hint>Lowest point the sleeve reaches. Raise it to keep strokes up off the base.</Hint>
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Max (Top)</span>
                <input 
                  type="range" min="0" max="100" name="maxStroke" 
                  value={params.maxStroke} onChange={handleChange}
                  className="w-full accent-gray-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 mt-1 block text-right">{params.maxStroke}%</span>
                <Hint>Highest point it reaches. Narrowing this window shortens every stroke.</Hint>
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
              <Hint low="None: ends at full intensity" high="300s: long, gradual wind-down">
                Eases both tempo and stroke length down to a gentle finish over the final{' '}
                {params.cooldownSec > 0 ? params.cooldownSec : 'N'} seconds.
              </Hint>
            </div>
          </div>
        </div>

      </div>
      )}

      {!collapsed && isAudio && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">

        {/* Section 1: Source */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Music} title="Audio Source" />

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Audio Type</label>
              <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleAudioChange('audioType', 'action')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    audioParams.audioType === 'action'
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Continuous (Action)
                </button>
                <button
                  type="button"
                  onClick={() => handleAudioChange('audioType', 'music')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    audioParams.audioType === 'music'
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Punchy (Music)
                </button>
              </div>
              <Hint>
                <b>Continuous</b> smooths the soundtrack into gradual build-ups. <b>Punchy</b> cuts the
                smoothing back and boosts peaks so the strokes land on beats.
              </Hint>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Audio Sensitivity</label>
                <span className="text-xs font-mono text-pink-500">{audioParams.sensitivity}%</span>
              </div>
              <input
                type="range" min="1" max="100"
                value={audioParams.sensitivity}
                onChange={(e) => handleAudioChange('sensitivity', parseInt(e.target.value, 10))}
                className="w-full accent-pink-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <Hint low="1: only the loudest moments register" high="100: quiet sounds drive full speed">
                How loud the soundtrack has to get before it asks for speed.
              </Hint>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Smoothing</label>
                <span className="text-xs font-mono text-emerald-500">{audioParams.smoothing}%</span>
              </div>
              <input
                type="range" min="0" max="95"
                value={audioParams.smoothing}
                onChange={(e) => handleAudioChange('smoothing', parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <Hint low="0: reacts to every noise, twitchy" high="95: long, lazy swells">
                How quickly the pace is allowed to follow the volume. Punchy mode takes 40 off this.
              </Hint>
            </div>
          </div>
        </div>

        {/* Section 2: Stroke Zone */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Sliders} title="Stroke Zone" />

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Min (Bot)</label>
                  <span className="text-[10px] font-mono text-gray-500">{audioParams.minHeight}%</span>
                </div>
                <input
                  type="range" min="0" max="50"
                  value={audioParams.minHeight}
                  onChange={(e) => handleAudioChange('minHeight', parseInt(e.target.value, 10))}
                  className="w-full accent-gray-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Hint>Lowest point the sleeve reaches.</Hint>
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max (Top)</label>
                  <span className="text-[10px] font-mono text-gray-500">{audioParams.maxHeight}%</span>
                </div>
                <input
                  type="range" min="50" max="100"
                  value={audioParams.maxHeight}
                  onChange={(e) => handleAudioChange('maxHeight', parseInt(e.target.value, 10))}
                  className="w-full accent-gray-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Hint>Highest point it reaches.</Hint>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                Audio mode always plays complete up/down strokes and guarantees at least a 50% range, so a
                narrow zone here is widened rather than reduced to a twitch.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Speed Mapping */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Volume2} title="Speed Mapping" />

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">When Quiet</label>
                  <span className="text-[10px] font-mono text-blue-500">{audioParams.minSpeed}%</span>
                </div>
                <input
                  type="range" min="0" max="50"
                  value={audioParams.minSpeed}
                  onChange={(e) => handleAudioChange('minSpeed', parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Hint low="0: near standstill in the silences" high="50: keeps ticking over" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">When Loud</label>
                  <span className="text-[10px] font-mono text-blue-500">{audioParams.maxSpeed}%</span>
                </div>
                <input
                  type="range" min="50" max="100"
                  value={audioParams.maxSpeed}
                  onChange={(e) => handleAudioChange('maxSpeed', parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Hint low="Caps the peaks" high="100: flat out at the loudest moments" />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                Volume maps to stroke duration: 100% is a 150ms stroke, 0% a 2s one. Generating drops the
                result into the history below, so the heatmap tools, undo and Download all apply.
              </p>
            </div>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
