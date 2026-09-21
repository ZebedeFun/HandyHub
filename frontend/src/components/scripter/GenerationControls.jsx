import React from 'react';
import { Settings, Play, Download, Activity, Sliders, Timer, Zap, Wand2, Undo2, Redo2, ChevronDown, ChevronUp, Music, Volume2, Loader2, LayoutGrid, Waves, Hand, Square, Circle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

// 1500 -> "+1.5s", -40 -> "-40ms". Past a second the ms count stops being
// readable at a glance.
function formatShift(ms, signed = true) {
  const sign = signed && ms > 0 ? '+' : '';
  if (Math.abs(ms) >= 1000) return `${sign}${+(ms / 1000).toFixed(3)}s`;
  return `${sign}${ms}ms`;
}

export default function GenerationControls({ params, setParams, onGenerate, canDownload, onDownload, onFixJitterWholeScript, onUndo, onRedo, canUndo, canRedo, collapsed, onToggleCollapsed, mode, setMode, audioParams, setAudioParams, isAnalyzingAudio, hasVideo, isRecording, tapStyle, setTapStyle, tapOffsetMs, setTapOffsetMs, tapCount, playbackRate, setPlaybackRate, onTap, onShiftScript, shiftedByMs, shiftTrimmedCount }) {
  // A video that is out by seconds would take dozens of clicks on the nudge
  // buttons, so a typed amount sits under them.
  const [shiftAmount, setShiftAmount] = React.useState('1');
  const [shiftUnit, setShiftUnit] = React.useState('s');
  const shiftAmountMs = Math.round(Math.abs(parseFloat(shiftAmount) || 0) * (shiftUnit === 's' ? 1000 : 1));
  const canShiftBy = canDownload && shiftAmountMs > 0;

  const isAudio = mode === 'audio';
  const isTap = mode === 'tap';
  const isZoned = audioParams?.structure === 'zoned';

  // Audio mode needs a soundtrack to read; without a video there is nothing to
  // generate from.
  const canGenerate = !isAnalyzingAudio && ((!isAudio && !isTap) || hasVideo);

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
    <div className={`bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 w-full flex flex-col ${collapsed ? '' : 'lg:h-full lg:min-h-0'}`}>
      <div className={`flex flex-col md:flex-row lg:flex-col md:items-center lg:items-stretch justify-between lg:justify-start gap-4 shrink-0 ${collapsed ? '' : 'mb-4 pb-3 border-b border-gray-100 dark:border-gray-700'}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show the script parameters' : 'Hide the script parameters, leaving the toolbar'}
          className="flex items-center gap-2 -ml-1 px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
        >
          <Settings className="text-blue-500" />
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Script Parameters</h2>
          {collapsed
            ? <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />
            : <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" />}
        </button>

        <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl lg:w-full">
          <button
            type="button"
            onClick={() => setMode('procedural')}
            title="Build a script from the parameters below"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex flex-1 items-center justify-center gap-1.5 ${
              !isAudio
                ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Sliders size={14} /> Parameters
          </button>
          <button
            type="button"
            onClick={() => setMode('tap')}
            title="Tap along with the video and keep what you tapped"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex flex-1 items-center justify-center gap-1.5 ${
              isTap
                ? 'bg-white dark:bg-gray-600 shadow-sm text-amber-600 dark:text-amber-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Hand size={14} /> Tap
          </button>
          <button
            type="button"
            onClick={() => setMode('audio')}
            title="Build a script from the loaded video's soundtrack"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex flex-1 items-center justify-center gap-1.5 ${
              isAudio
                ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Music size={14} /> Audio
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={onGenerate}
            disabled={!canGenerate}
            title={!hasVideo && (isAudio || isTap)
              ? (isAudio ? 'Load a video first — Audio mode reads its soundtrack' : 'Load a video first — there is nothing to tap along to')
              : undefined}
            className={`py-2 px-4 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 lg:w-full ${
              canGenerate
                ? (isRecording
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 transform hover:-translate-y-0.5'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-0.5')
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed shadow-none'
            }`}
          >
            {isAnalyzingAudio
              ? <Loader2 size={16} className="animate-spin" />
              : isRecording
                ? <Square size={16} />
                : isTap ? <Circle size={16} /> : <Play size={16} />}
            {isAnalyzingAudio
              ? 'Analyzing Audio…'
              : isTap
                ? (isRecording ? `Stop & Apply (${tapCount})` : 'Record Taps')
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

          {/* Whole-script timing. A script that is right but late — an import,
              or a take tapped a beat behind — needs sliding, not rebuilding.
              "Earlier" means the action comes sooner against the video. */}
          <div className="flex flex-col gap-1.5 w-full">
            <div className="flex items-center gap-1 w-full">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mr-1 shrink-0 w-7">Shift</span>
              {[[-100, ChevronsLeft, '100ms earlier'], [-10, ChevronLeft, '10ms earlier'],
                [10, ChevronRight, '10ms later'], [100, ChevronsRight, '100ms later']].map(([delta, Icon, label]) => (
                <button
                  key={delta}
                  onClick={() => onShiftScript(delta)}
                  disabled={!canDownload}
                  title={`Move the whole script ${label}`}
                  className={`p-1.5 rounded-lg border transition-all ${
                    canDownload
                      ? 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                      : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed border-transparent'
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
              {/* Clicking the total slides the script back to where it started;
                  points pushed off the front come back with it. */}
              <button
                onClick={() => onShiftScript(-shiftedByMs)}
                disabled={!canDownload || !shiftedByMs}
                title={shiftedByMs
                  ? `Shifted ${formatShift(shiftedByMs)} in total — click to put it back${shiftTrimmedCount ? ` (${shiftTrimmedCount} point${shiftTrimmedCount === 1 ? '' : 's'} before 0:00 held back)` : ''}`
                  : 'Not shifted'}
                className={`text-[10px] font-mono ml-1 tabular-nums px-1 rounded ${
                  shiftedByMs && canDownload
                    ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer'
                    : 'text-gray-400 dark:text-gray-500 cursor-default'
                }`}
              >
                {formatShift(shiftedByMs)}
              </button>
            </div>
            <div className="flex items-center gap-1 w-full">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mr-1 shrink-0 w-7">By</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={shiftUnit === 's' ? 0.1 : 10}
                value={shiftAmount}
                onChange={(e) => setShiftAmount(e.target.value)}
                disabled={!canDownload}
                aria-label="Amount to shift the whole script by"
                className="w-16 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-[10px] font-medium">
                {['ms', 's'].map(u => (
                  <button
                    key={u}
                    onClick={() => setShiftUnit(u)}
                    className={`px-1.5 py-1 ${shiftUnit === u
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              {[[-1, ChevronLeft, 'Earlier'], [1, ChevronRight, 'Later']].map(([sign, Icon, label]) => (
                <button
                  key={label}
                  onClick={() => onShiftScript(sign * shiftAmountMs)}
                  disabled={!canShiftBy}
                  title={`Move the whole script ${formatShift(shiftAmountMs, false)} ${label.toLowerCase()}`}
                  className={`flex items-center gap-0.5 py-1 pl-1 pr-2 text-[11px] font-medium rounded-lg border transition-all ${
                    canShiftBy
                      ? 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                      : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed border-transparent'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!collapsed && !isAudio && !isTap && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 overflow-y-auto min-h-0 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 overflow-y-auto min-h-0 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">

        {/* Section 1: Source */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Music} title="Audio Source" />

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Structure</label>
              <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleAudioChange('structure', 'flowing')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    !isZoned
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Waves size={13} /> Flowing
                </button>
                <button
                  type="button"
                  onClick={() => handleAudioChange('structure', 'zoned')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    isZoned
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <LayoutGrid size={13} /> Zoned
                </button>
              </div>
              <Hint>
                <b>Flowing</b> re-reads the sound every 50ms, so the pace never settles. <b>Zoned</b> reads
                each section of the track for its character, commits to a tempo and depth, and holds them
                steady before gliding to the next — the shape hand-made scripts have.
              </Hint>
            </div>

            {isZoned && (
              <>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Section Length</label>
                    <span className="text-xs font-mono text-indigo-500">{audioParams.zoneLengthSec}s</span>
                  </div>
                  <input
                    type="range" min="4" max="60"
                    value={audioParams.zoneLengthSec}
                    onChange={(e) => handleAudioChange('zoneLengthSec', parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <Hint low="4s: restless, changes constantly" high="60s: long, committed passages">
                    Roughly how long one settled section lasts. A section still ends early if the track
                    clearly changes.
                  </Hint>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Depth Variation</label>
                    <span className="text-xs font-mono text-purple-500">{audioParams.depthVariation}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={audioParams.depthVariation}
                    onChange={(e) => handleAudioChange('depthVariation', parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <Hint low="0: every section uses the full stroke zone" high="100: punchy sections deep, flat ones shallow">
                    How much stroke depth changes between sections. Driven by how peaky each section is, not
                    by how loud — so depth and speed vary independently.
                  </Hint>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Transition Length</label>
                    <span className="text-xs font-mono text-cyan-500">{audioParams.rampStrokes} strokes</span>
                  </div>
                  <input
                    type="range" min="1" max="20"
                    value={audioParams.rampStrokes}
                    onChange={(e) => handleAudioChange('rampStrokes', parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <Hint low="1: snaps between sections" high="20: long, gradual gear-change">
                    Strokes spent gliding from one section's feel into the next.
                  </Hint>
                </div>
              </>
            )}

            {!isZoned && (
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
            )}

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
                {isZoned
                  ? 'Bends how a section\'s loudness maps to its tempo. Sections are judged against the rest of this track, so the full speed range gets used whatever the recording level.'
                  : 'How loud the soundtrack has to get before it asks for speed.'}
              </Hint>
            </div>

            {!isZoned && (
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
            )}
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
                {isZoned
                  ? 'Zoned mode moves a stroke window around inside these bounds — each section gets its own depth and its own height within them.'
                  : 'Audio mode always plays complete up/down strokes and guarantees at least a 50% range, so a narrow zone here is widened rather than reduced to a twitch.'}
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

      {!collapsed && isTap && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 overflow-y-auto min-h-0 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">

        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
          <SectionTitle icon={Hand} title="Tap Along" />

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">What one tap means</label>
              <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTapStyle('alternate')}
                  className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-1 ${
                    tapStyle === 'alternate'
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-amber-600 dark:text-amber-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Every turn
                </button>
                <button
                  type="button"
                  onClick={() => setTapStyle('beat')}
                  className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-1 ${
                    tapStyle === 'beat'
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-amber-600 dark:text-amber-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Every stroke
                </button>
              </div>
              <Hint>
                <b>Every turn</b> takes a tap at each change of direction — two per stroke, and each end lands
                exactly where you tapped it, so an unhurried pull and a sharp push stay different.
                <b> Every stroke</b> takes one tap per stroke and puts the return halfway to your next tap:
                half the tapping, but every stroke comes out even.
              </Hint>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Playback Speed</label>
                <span className="text-xs font-mono text-amber-500">{playbackRate}×</span>
              </div>
              <div className="flex gap-1">
                {[1, 0.75, 0.5, 0.35, 0.25].map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`flex-1 px-1 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                      playbackRate === rate
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {rate}×
                  </button>
                ))}
              </div>
              <Hint low="Quarter speed: four times as long to react" high="Full speed">
                Slow the video down for a fast section. Taps are timed against the video's own clock, so a
                section tapped at quarter speed plays back at full speed exactly where you put it.
              </Hint>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Tap Offset</label>
                <span className="text-xs font-mono text-amber-500">{tapOffsetMs > 0 ? `+${tapOffsetMs}` : tapOffsetMs}ms</span>
              </div>
              <input
                type="range" min="-400" max="200" step="10"
                value={tapOffsetMs}
                onChange={(e) => setTapOffsetMs(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <Hint low="-400ms: for a heavy hand" high="+200ms">
                Taken off every tap as it lands. Nobody taps on the instant they see something, so if the take
                comes out consistently behind the action, wind this back until it sits right.
              </Hint>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700/50">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); if (isRecording) onTap(); }}
                onTouchStart={(e) => { e.preventDefault(); if (isRecording) onTap(); }}
                disabled={!isRecording}
                className={`w-full py-6 rounded-xl text-lg font-bold transition-colors select-none ${
                  isRecording
                    ? 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                {isRecording ? `TAP  ·  ${tapCount} point${tapCount === 1 ? '' : 's'}` : 'Press Record to start'}
              </button>
              <Hint>
                Space is the same button and leaves your eyes on the video; Esc stops. Stroke depth comes from
                Min and Max Depth on the Parameters tab. What you tap over replaces whatever was there, and
                arrives as one undo step.
              </Hint>
            </div>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
