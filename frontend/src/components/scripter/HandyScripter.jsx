import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Upload, Settings, Maximize, Minimize } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GenerationControls from './GenerationControls';
import Heatmap from './Heatmap';
import DeviceSimulator from './DeviceSimulator';
import ScrollingTimeline from './ScrollingTimeline';
import { generateProceduralScript, generatePartialScript, modifyPartialScript, buildTapActions } from '../../services/scriptGenerator';
import { getServerTimeOffset, hsspSetup, hsspPlay, hsspStop } from '../../services/handyService';
import { analyzeAudioFile, generateAudioScript, DEFAULT_AUDIO_PARAMS } from '../../services/audioScriptGenerator';
import { downloadFunscript } from '../../services/funscriptFile';

// The device simulator occupies its own w-20 column to the LEFT of the video,
// so the video element — and with it the browser's native progress bar — starts
// 80px in from the left edge of the page column. The script graphs underneath
// are full width, which is why a playhead at 50% of the script sat well left of
// the video's own 50%. Indenting the graph block by the same amount lines the
// two up.
const SIMULATOR_COL_PX = 80;

// Closest two hand-placed points are allowed to be. The Handy reads a script as
// a series of moves, so two actions a few ms apart ask for an impossible speed
// and come out as a jolt.
const MIN_POINT_GAP_MS = 20;

// Browsers also inset their scrub track a little from the edge of the video
// element. This is an approximation, not a measurement: the native controls
// live in a closed shadow root, so there is nothing to measure. It gets the
// ends within a few pixels; tune this one number if it still looks off.
const NATIVE_SCRUBBER_INSET_PX = 16;

// Below lg the page falls back to a single stacked column, and there the video
// still needs a floor before the page scrolls instead of squeezing it further.
// It is written as a literal class (min-h-[360px]) rather than built from a
// constant because Tailwind only sees class names it can read in the source.

export default function HandyScripter({ isDarkMode, toggleTheme, settings, openSettings }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  
  const [videoFile, setVideoFile] = useState(null);
  // Filename of a .funscript imported on its own, used to name the download.
  const [importedScriptName, setImportedScriptName] = useState(null);
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

  // A run of small edits of the same kind — arrow-key nudges, repeated taps on
  // a shift button — is one act as far as the user is concerned. Without this
  // a dozen nudges push a dozen states, and Ctrl+Z has to be held down to get
  // back anywhere useful.
  const COALESCE_MS = 900;
  const lastCommitRef = useRef({ key: null, time: 0 });

  // How far the script has been slid in time, kept per script version rather
  // than in its own state, so Ctrl+Z puts the counter back along with the
  // points. `trimmed` holds points a shift pushed before 0:00: shifting back
  // returns them instead of leaving a hole at the start, so -2s then +2s is a
  // no-op. Only a run of shifts carries them; any other edit lets them go.
  const shiftMetaRef = useRef(new WeakMap());
  const shiftMeta = (fs) => (fs && shiftMetaRef.current.get(fs)) || { totalMs: 0, trimmed: [] };

  // `freshTiming` marks a script whose times owe nothing to the one before it
  // (a loaded file, a full generation), so it starts unshifted. Every other
  // edit is still the same script, shifted by as much as it was.
  const commitFunscript = (next, coalesceKey, { freshTiming = false } = {}) => {
    if (next && !shiftMetaRef.current.has(next)) {
      const totalMs = freshTiming ? 0 : shiftMeta(funscript).totalMs;
      if (totalMs) shiftMetaRef.current.set(next, { totalMs, trimmed: [] });
    }
    const now = Date.now();
    const last = lastCommitRef.current;
    const coalesce = coalesceKey && last.key === coalesceKey && now - last.time < COALESCE_MS;
    lastCommitRef.current = { key: coalesceKey || null, time: now };
    setHistory(h => (coalesce
      ? { ...h, present: next, future: [] }
      : { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] }));
  };

  // Starting over (a new video) drops the history rather than adding to it.
  const resetFunscript = (next) => setHistory({ past: [], present: next, future: [] });

  const undo = () => {
    lastCommitRef.current = { key: null, time: 0 };
    setHistory(h => h.past.length === 0 ? h : ({
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  }));
  };

  const redo = () => {
    lastCommitRef.current = { key: null, time: 0 };
    setHistory(h => h.future.length === 0 ? h : ({
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present: h.future[0],
    future: h.future.slice(1),
  }));
  };

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

  // Tap-to-script. The taps themselves live in a ref because the key handler
  // has to read the ones already taken without being rebuilt on every press;
  // the state copy is only there to draw the preview.
  const [isRecording, setIsRecording] = useState(false);
  const [tapStyle, setTapStyle] = useState('alternate');
  const [tapOffsetMs, setTapOffsetMs] = useState(0);
  const [pendingTaps, setPendingTaps] = useState([]);
  const [playbackRate, setPlaybackRate] = useState(1);
  const tapsRef = useRef([]);
  const [isViewingMode, setIsViewingMode] = useState(false);

  // The parameter panel is by far the tallest thing on the page, so collapsing
  // it is the main way to hand the video its room back. Remembered so the
  // choice survives a reload.
  const [controlsCollapsed, setControlsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('handyscripter.controlsCollapsed') === '1';
    } catch {
      return false; // private mode / storage blocked
    }
  });

  const toggleControlsCollapsed = () => setControlsCollapsed(prev => {
    const next = !prev;
    try {
      localStorage.setItem('handyscripter.controlsCollapsed', next ? '1' : '0');
    } catch {
      // Not worth failing the toggle over.
    }
    return next;
  });

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
  
  // Two ways to build a script from here: from the parameters below, or from
  // the loaded video's own soundtrack (the same engine the Auto Sync tab runs
  // live). Either way the result lands in the edit history, so the heatmap
  // tools, undo and Download all apply to it.
  const [genMode, setGenMode] = useState('procedural'); // 'procedural' | 'audio'
  const [audioParams, setAudioParams] = useState(DEFAULT_AUDIO_PARAMS);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);

  // Decoding a feature-length soundtrack is slow, and the envelope depends only
  // on the file — so it is kept and reused while you retune the audio sliders,
  // and thrown away when a different video is loaded.
  const [audioEnvelope, setAudioEnvelope] = useState(null);

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
      setImportedScriptName(null);
      setAudioEnvelope(null);
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
      setAudioEnvelope(null);
    } else if (file.name.endsWith('.funscript') || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          if (json.actions) {
             commitFunscript(json, null, { freshTiming: true });
             setImportedScriptName(file.name);
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
    commitFunscript(script, null, { freshTiming: true });
  };

  const handleGenerateFromAudio = async () => {
    if (!videoFile) {
      alert("Load a video first — Audio mode builds the script from its soundtrack.");
      return;
    }
    setIsAnalyzingAudio(true);
    try {
      let envelope = audioEnvelope;
      if (!envelope) {
        envelope = await analyzeAudioFile(videoFile);
        setAudioEnvelope(envelope);
      }
      const script = generateAudioScript(envelope, audioParams);
      if (!script) {
        alert("No audio could be read from this video.");
        return;
      }
      commitFunscript(script, null, { freshTiming: true });
    } catch (err) {
      console.error("Audio analysis failed:", err);
      alert("Could not extract audio from this video. Ensure it contains an audio track.");
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleGenerateClick = () => {
    if (genMode === 'tap') return toggleRecording();
    return genMode === 'audio' ? handleGenerateFromAudio() : handleGenerate();
  };

  const handleRegenerateSelection = (startMs, endMs) => {
    if (!funscript || !funscript.actions) return;
    const newScript = generatePartialScript(funscript.actions, startMs, endMs, params);
    // Spread over the old script, not in place of it: these helpers return
    // only `actions`, and a script imported with metadata would lose it.
    commitFunscript({ ...funscript, ...newScript });
  };

  const handleModifySelection = (startMs, endMs, type) => {
    if (!funscript || !funscript.actions) return;
    const newScript = modifyPartialScript(funscript.actions, startMs, endMs, type);
    commitFunscript({ ...funscript, ...newScript });
  };

  const handleFixJitterWholeScript = () => {
    if (!funscript || !funscript.actions || !durationMs) return;
    const newScript = modifyPartialScript(funscript.actions, 0, durationMs, 'jitter');
    commitFunscript({ ...funscript, ...newScript });
  };

  // Hand edits on the scrolling timeline. The bar hit-tests in pixels and
  // hands back an index, so these three only have to keep the actions array
  // valid: sorted by time, no two actions at the same millisecond.
  //
  // A script needs two points to be a script, so the last pair is not
  // removable — beyond that the ends are fair game, which is how trailing
  // rubbish at the end of a generated script gets cleaned up.
  const handleRemovePoint = (index) => {
    if (!funscript || !funscript.actions) return;
    if (index < 0 || index >= funscript.actions.length) return;
    if (funscript.actions.length <= 2) return;
    const newActions = [...funscript.actions];
    newActions.splice(index, 1);
    commitFunscript({ ...funscript, actions: newActions });
  };

  const handleAddPoint = (timeMs, pos) => {
    const at = Math.max(0, Math.round(timeMs));
    if (durationMs && at > durationMs) return;
    const actions = (funscript && funscript.actions) || [];

    let insertAt = actions.findIndex(a => a.at >= at);
    if (insertAt === -1) insertAt = actions.length;

    // A click right on top of an existing point is a miss, not an insert:
    // dragging that point is what the user wanted, and two actions within a
    // few ms of each other read as a jitter spike on the device.
    const crowded = [actions[insertAt - 1], actions[insertAt]]
      .some(a => a && Math.abs(a.at - at) < MIN_POINT_GAP_MS);
    if (crowded) return;

    const newActions = [...actions];
    newActions.splice(insertAt, 0, { at, pos: Math.max(0, Math.min(100, Math.round(pos))) });
    commitFunscript({ ...(funscript || {}), actions: newActions });
  };

  const handleMovePoint = (index, timeMs, pos, coalesceKey) => {
    if (!funscript || !funscript.actions) return;
    const actions = funscript.actions;
    if (index < 0 || index >= actions.length) return;

    const prev = actions[index - 1];
    const next = actions[index + 1];
    const lo = prev ? prev.at + 1 : 0;
    const hi = next ? next.at - 1 : Math.max(lo, Math.round(timeMs));
    const at = Math.round(Math.max(lo, Math.min(hi, timeMs)));

    const newActions = [...actions];
    newActions[index] = { ...actions[index], at, pos: Math.max(0, Math.min(100, Math.round(pos))) };
    commitFunscript({ ...funscript, actions: newActions }, coalesceKey);
  };

  // --- Tap to script -------------------------------------------------------

  const tapDepth = () => ({
    bottom: Math.min(params.minStroke, params.maxStroke),
    top: Math.max(params.minStroke, params.maxStroke),
  });

  const recordTap = () => {
    const video = videoRef.current;
    if (!video) return;
    // The offset is applied as the tap is taken, so the preview shows where
    // the point will actually land rather than where the finger landed.
    const at = Math.max(0, Math.round(video.currentTime * 1000 + tapOffsetMs));
    const taps = tapsRef.current;
    // A key repeat or a double-triggered button is not a stroke.
    if (taps.length && Math.abs(at - taps[taps.length - 1]) < MIN_POINT_GAP_MS) return;
    taps.push(at);
    setPendingTaps(buildTapActions(taps, { style: tapStyle, ...tapDepth() }));
  };

  const startRecording = () => {
    const video = videoRef.current;
    if (!video) return;
    tapsRef.current = [];
    setPendingTaps([]);
    setIsRecording(true);
    video.play().catch(() => { /* autoplay refused; the user can hit play */ });
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (videoRef.current) videoRef.current.pause();

    const recorded = buildTapActions(tapsRef.current, { style: tapStyle, ...tapDepth() });
    tapsRef.current = [];
    setPendingTaps([]);
    if (recorded.length < 2) return;

    // What was tapped over is replaced, not merged into: tapping a section is
    // how you say "this bit, again, properly", and leaving the old points in
    // would interleave two takes.
    const from = recorded[0].at;
    const to = recorded[recorded.length - 1].at;
    const kept = (funscript?.actions || []).filter(a => a.at < from || a.at > to);
    const merged = [...kept, ...recorded].sort((a, b) => a.at - b.at);
    commitFunscript({ ...(funscript || {}), actions: merged });
  };

  const toggleRecording = () => (isRecording ? stopRecording() : startRecording());

  // Space is the tap key, so while recording it must not reach the video and
  // pause it. Captured on the way down for that reason.
  useEffect(() => {
    if (!isRecording) return undefined;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) recordTap();
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Slow motion for sections too quick to keep up with. Tap times are read off
  // the video's own clock, which does not slow down with it, so a script
  // tapped at quarter speed lands at full speed without any correction.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  // A recording that never got a second tap would otherwise leave the video
  // running after the panel says it stopped.
  useEffect(() => {
    if (!videoUrl && isRecording) setIsRecording(false);
  }, [videoUrl, isRecording]);

  // --- Whole-script timing -------------------------------------------------

  const handleShiftScript = (deltaMs) => {
    deltaMs = Math.round(deltaMs);
    if (!deltaMs || !funscript || !funscript.actions || funscript.actions.length === 0) return;
    const { totalMs, trimmed } = shiftMeta(funscript);
    const moved = [...trimmed, ...funscript.actions].map(a => ({ ...a, at: Math.round(a.at + deltaMs) }));
    const actions = moved.filter(a => a.at >= 0);
    if (actions.length < 2) return;
    const next = { ...funscript, actions };
    shiftMetaRef.current.set(next, { totalMs: totalMs + deltaMs, trimmed: moved.filter(a => a.at < 0) });
    commitFunscript(next, 'shift');
  };
  const { totalMs: shiftedByMs, trimmed: shiftTrimmed } = shiftMeta(funscript);

  // Download logic. Only the script is required. Requiring a video too meant a
  // .funscript dropped in on its own could be edited with every tool here and
  // then never saved — the button simply did nothing.
  //
  // Named after the video, else the imported script, else a fallback.
  const handleDownload = () => downloadFunscript(funscript, videoFile?.name || importedScriptName);

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
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Handy Scripter</h1>
            {/* What is loaded. Two videos from the same set are told apart by
                their filenames and nothing else, and after an hour of editing
                it is worth being able to check. */}
            {(videoFile || importedScriptName) && (
              <p
                className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[16rem] sm:max-w-sm md:max-w-md"
                title={videoFile?.name || importedScriptName}
              >
                {videoFile?.name || importedScriptName}
                {videoFile && importedScriptName ? ` + ${importedScriptName}` : ''}
              </p>
            )}
          </div>
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

      {/* Main Content.
          From lg up this is two columns: the parameters stand in their own
          scrolling column on the left, and the video keeps the two script bars
          directly beneath it on the right, so a slider and the graph it changes
          are on screen at the same time. Below lg it falls back to the stacked
          layout, where the page scrolls as before. */}
      <main className="flex-1 overflow-y-auto lg:overflow-hidden p-4 md:p-6 lg:p-8">
        <div className="max-w-[110rem] mx-auto min-h-full lg:h-full flex flex-col lg:flex-row gap-4 lg:gap-6">
          
          {/* Left: Controls. The column keeps its width when the panel is
              collapsed — the video is height-bound, not width-bound, so there is
              nothing to win by narrowing it — but the collapsed card sits at the
              top as a compact toolbar instead of stretching down an empty
              column. */}
          <div className={`w-full shrink-0 flex lg:w-[22rem] xl:w-[26rem] lg:h-full lg:min-h-0 ${
            controlsCollapsed ? 'lg:items-start' : ''
          }`}>
            <GenerationControls 
              params={params}
              setParams={setParams}
              onGenerate={handleGenerateClick}
              canDownload={!!funscript}
              onDownload={handleDownload}
              onFixJitterWholeScript={handleFixJitterWholeScript}
              onUndo={undo}
              onRedo={redo}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              collapsed={controlsCollapsed}
              onToggleCollapsed={toggleControlsCollapsed}
              mode={genMode}
              setMode={setGenMode}
              audioParams={audioParams}
              setAudioParams={setAudioParams}
              isAnalyzingAudio={isAnalyzingAudio}
              hasVideo={!!videoUrl}
              isRecording={isRecording}
              tapStyle={tapStyle}
              setTapStyle={setTapStyle}
              tapOffsetMs={tapOffsetMs}
              setTapOffsetMs={setTapOffsetMs}
              tapCount={pendingTaps.length}
              playbackRate={playbackRate}
              setPlaybackRate={setPlaybackRate}
              onTap={recordTap}
              onShiftScript={handleShiftScript}
              shiftedByMs={shiftedByMs}
              shiftTrimmedCount={shiftTrimmed.length}
            />
          </div>
          
          {/* Right: the video, with the script bars kept under it */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 lg:h-full lg:min-h-0">

            {/* Video Player Area */}
            <div
              className={isViewingMode ? "fixed inset-0 z-50 bg-black flex flex-row group" : "flex-1 min-h-[360px] lg:min-h-0 bg-black rounded-2xl overflow-hidden relative shadow-lg flex flex-row border border-gray-800 group"}
            >
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

            {/* Under the video: the script bars, indented to line up with its scrubber */}
            <div
              className="flex flex-col gap-4 shrink-0 w-full pb-4"
              style={{
                paddingLeft: (videoUrl && funscript ? SIMULATOR_COL_PX : 0) + NATIVE_SCRUBBER_INSET_PX,
                paddingRight: NATIVE_SCRUBBER_INSET_PX,
              }}
            >
              {(funscript || isRecording) ? (
                <>
                  <ScrollingTimeline 
                    actions={funscript ? funscript.actions : []} 
                    currentTimeMs={currentTimeMs} 
                    isPlaying={isPlaying}
                    videoRef={videoRef}
                    onRemovePoint={handleRemovePoint}
                    onAddPoint={handleAddPoint}
                    onMovePoint={handleMovePoint}
                    onRegenerateSelection={handleRegenerateSelection}
                    onModifySelection={handleModifySelection}
                    pendingActions={pendingTaps}
                  />
                  <div className="h-40">
                    {funscript ? (
                    <Heatmap 
                      actions={funscript.actions} 
                      durationMs={durationMs} 
                      currentTimeMs={currentTimeMs} 
                      onRegenerateSelection={handleRegenerateSelection}
                      onModifySelection={handleModifySelection}
                    />
                    ) : (
                      <div className="w-full h-full bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-300 dark:border-gray-700 border-dashed">
                        <p className="text-gray-500 dark:text-gray-400">Tap along — the take appears above</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full h-40 bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-300 dark:border-gray-700 border-dashed">
                  <p className="text-gray-500 dark:text-gray-400">Generate a script to see the timeline heatmap</p>
                </div>
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
