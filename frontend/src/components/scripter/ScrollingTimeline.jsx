import React, { useRef, useEffect, useState } from 'react';
import { Eye, Plus, Eraser, BoxSelect, ZoomIn, ZoomOut, X, RefreshCw } from 'lucide-react';
import { DEVICE_MAX_UNITS_PER_SEC } from '../../services/handyService';
import { MIN_GAP_MS } from '../../services/scriptGenerator';

const getSpeedColor = (deltaPos, deltaMs) => {
  if (deltaMs === 0) return '#3b82f6';
  const speed = Math.abs(deltaPos) / (deltaMs / 1000);
  if (speed < 50) return '#3b82f6'; // Blue
  if (speed < 100) return '#10b981'; // Green
  if (speed < 150) return '#eab308'; // Yellow
  if (speed < 200) return '#f97316'; // Orange
  return '#ef4444'; // Red
};

// What the hardware cannot do, as opposed to what merely looks fast. Either the
// carriage is being asked to travel faster than it can, or the two actions are
// so close together that the device cannot turn around between them.
//
// The speed half is the worst case: it assumes position 0-100 spans the
// carriage's full travel. A device set to a narrower slide zone covers less
// distance for the same script and can keep up with more than this allows, so
// a marked segment means "too fast at full range", not "always too fast".
const overDeviceLimit = (a, b) => {
  const deltaMs = b.at - a.at;
  if (deltaMs <= 0) return true;
  if (deltaMs < MIN_GAP_MS) return true;
  return Math.abs(b.pos - a.pos) / (deltaMs / 1000) > DEVICE_MAX_UNITS_PER_SEC;
};

// Zoom steps for the visible window, in ms. Two seconds is about as far in as
// is useful (a fast stroke is ~200ms, so points are still well separated);
// thirty seconds is where individual points stop being clickable.
const WINDOW_STEPS_MS = [2000, 3000, 4000, 6000, 10000, 15000, 30000];
const DEFAULT_WINDOW_INDEX = 3; // 6000ms, the window this bar has always used

// How close the pointer has to be to a point, in CSS pixels, to grab it.
const HIT_RADIUS_PX = 14;
// A press that travels further than this is a drag, not a click. Without it a
// shaky click in Delete mode would move a point instead of removing it.
const DRAG_THRESHOLD_PX = 4;
// Below this a range selection is treated as a mis-click, not a selection.
const MIN_SELECTION_MS = 80;

// Keyboard nudge steps for the selected point, and what Shift multiplies them by.
const NUDGE_MS = 5;
const NUDGE_POS = 2;
const NUDGE_COARSE = 5;

const MODES = [
  { id: 'view', Icon: Eye, label: 'View', hint: 'View only — click to seek, drag to scrub' },
  { id: 'add', Icon: Plus, label: 'Add', hint: 'Click to add a point, click one to select it, drag one to move it' },
  { id: 'delete', Icon: Eraser, label: 'Delete', hint: 'Click to delete the nearest point, drag one to move it' },
  { id: 'select', Icon: BoxSelect, label: 'Select', hint: 'Drag across a range to edit it as a block' },
];

const RANGE_OPS = [
  { type: 'faster', label: 'Faster' },
  { type: 'slower', label: 'Slower' },
  { type: 'higher', label: 'Higher' },
  { type: 'lower', label: 'Lower' },
  { type: 'longer', label: 'Deeper' },
  { type: 'shorter', label: 'Shallower' },
  { type: 'invert', label: 'Invert' },
  { type: 'jitter', label: 'De-jitter' },
  { type: 'clear', label: 'Clear' },
];

const readStored = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback; // private mode / storage blocked
  }
};

const writeStored = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not worth failing the interaction over.
  }
};

export default function ScrollingTimeline({
  actions,
  pendingActions,
  currentTimeMs,
  isPlaying,
  videoRef,
  onRemovePoint,
  onAddPoint,
  onMovePoint,
  onRegenerateSelection,
  onModifySelection,
}) {
  const canvasRef = useRef(null);
  const requestRef = useRef();

  const [editMode, setEditMode] = useState(() => {
    const stored = readStored('handyscripter.timelineMode', 'delete');
    return MODES.some(m => m.id === stored) ? stored : 'delete';
  });
  const [windowIndex, setWindowIndex] = useState(() => {
    const stored = parseInt(readStored('handyscripter.timelineZoom', ''), 10);
    return Number.isInteger(stored) && WINDOW_STEPS_MS[stored] ? stored : DEFAULT_WINDOW_INDEX;
  });
  const windowMs = WINDOW_STEPS_MS[windowIndex];

  // The point the arrow keys move. Set by clicking one in Add mode, or by
  // dragging any point — the thing you just touched is the thing you are most
  // likely to want to fine-tune.
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [range, setRange] = useState(null); // { startMs, endMs } once a selection is settled

  // Hover, drag, scrub and the in-progress marquee live in refs, not state:
  // they all change on every pointermove and only affect what the canvas
  // paints. Re-rendering for them would mean a React pass per mouse movement.
  const hoverRef = useRef(null);   // { index, at, pos } — index -1 over empty space
  const dragRef = useRef(null);    // { index, at, pos, startX, startY, moved }
  const scrubRef = useRef(null);   // { startX, startTime, moved }
  const marqueeRef = useRef(null); // { startAt, endAt }

  // The time the last frame was painted for. Pointer coordinates are converted
  // back to times against this, so a click always means what the user saw,
  // even mid-playback when the video has already moved on.
  const drawnTimeRef = useRef(0);

  const setMode = (id) => {
    setEditMode(id);
    writeStored('handyscripter.timelineMode', id);
    hoverRef.current = null;
    marqueeRef.current = null;
    setSelectedIndex(null);
    if (id !== 'select') setRange(null);
  };

  const zoom = (delta) => setWindowIndex(prev => {
    const next = Math.min(WINDOW_STEPS_MS.length - 1, Math.max(0, prev + delta));
    writeStored('handyscripter.timelineZoom', String(next));
    return next;
  });

  // An index is only meaningful against the array it came from. Anything that
  // changes the length of the script — a regenerate, an add, a delete — can
  // move every point along, so the selection is dropped rather than left
  // pointing at whatever happens to sit there now.
  const actionCount = actions ? actions.length : 0;
  useEffect(() => { setSelectedIndex(null); }, [actionCount]);

  // Grid spacing that keeps roughly ten vertical lines on screen at any zoom.
  const gridStepMs = (() => {
    const candidates = [100, 250, 500, 1000, 2000, 5000, 10000];
    return candidates.find(c => windowMs / c <= 12) || 10000;
  })();

  const draw = (timeMs) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    drawnTimeRef.current = timeMs;

    ctx.clearRect(0, 0, w, h);

    const startTime = timeMs - windowMs / 2;
    const endTime = timeMs + windowMs / 2;
    const xOf = (at) => ((at - startTime) / windowMs) * w;
    const yOf = (pos) => h - (pos / 100) * h;

    // Draw background grid lines (horizontal)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = i * (h / 4);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Draw vertical grid lines
    const firstLine = Math.floor(startTime / gridStepMs) * gridStepMs;
    ctx.beginPath();
    for (let t = firstLine; t <= endTime; t += gridStepMs) {
      const x = xOf(t);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    // The range selection is painted here rather than as an overlay div so it
    // stays pinned to its times while the bar scrolls under it.
    const marquee = marqueeRef.current;
    const band = marquee
      ? { startMs: Math.min(marquee.startAt, marquee.endAt), endMs: Math.max(marquee.startAt, marquee.endAt) }
      : range;
    if (band) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
      ctx.fillRect(xOf(band.startMs), 0, xOf(band.endMs) - xOf(band.startMs), h);
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xOf(band.startMs), 0); ctx.lineTo(xOf(band.startMs), h);
      ctx.moveTo(xOf(band.endMs), 0); ctx.lineTo(xOf(band.endMs), h);
      ctx.stroke();
    }

    if (actions && actions.length > 0) {
      // Find actions within or overlapping the window
      let startIndex = actions.length - 1;
      for (let i = 0; i < actions.length; i++) {
        if (actions[i].at >= startTime) {
          startIndex = Math.max(0, i - 1);
          break;
        }
      }
      let endIndex = actions.length - 1;
      for (let i = startIndex; i < actions.length; i++) {
        if (actions[i].at > endTime) {
          endIndex = i;
          break;
        }
      }

      // A point being dragged is painted where the pointer is, but is not
      // committed to the script until the drag ends — so the script itself is
      // still the one state, and one undo step covers the whole drag.
      const drag = dragRef.current;
      const actionAt = (i) => (
        drag && drag.moved && drag.index === i ? { at: drag.at, pos: drag.pos } : actions[i]
      );

      // Segments the device cannot physically follow, marked along the top
      // edge. The colour ramp already says "fast"; this says "impossible".
      for (let i = startIndex; i < endIndex; i++) {
        if (!overDeviceLimit(actionAt(i), actionAt(i + 1))) continue;
        const x1 = xOf(actionAt(i).at);
        const x2 = xOf(actionAt(i + 1).at);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillRect(x1, 0, Math.max(2, x2 - x1), 4);
      }

      // Draw the script line
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = startIndex; i < endIndex; i++) {
        const current = actionAt(i);
        const next = actionAt(i + 1);
        const color = getSpeedColor(next.pos - current.pos, next.at - current.at);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.moveTo(xOf(current.at), yOf(current.pos));
        ctx.lineTo(xOf(next.at), yOf(next.pos));
        ctx.stroke();
      }

      // Draw the points themselves. Editing by hand is guesswork without them:
      // the line alone gives no clue where one action ends and the next begins.
      const hover = hoverRef.current;
      const activeIndex = drag ? drag.index : (hover ? hover.index : -1);
      for (let i = startIndex; i <= endIndex; i++) {
        const a = actionAt(i);
        const isActive = i === activeIndex;
        const isSelected = i === selectedIndex;
        ctx.beginPath();
        ctx.arc(xOf(a.at), yOf(a.pos), isActive || isSelected ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#ec4899' : (isSelected ? '#facc15' : 'rgba(17, 24, 39, 0.9)');
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isActive || isSelected ? '#fff' : 'rgba(255, 255, 255, 0.75)';
        ctx.stroke();
      }

      // In Add mode, show where the point would land before it is committed.
      if (editMode === 'add' && !drag && hover && hover.index === -1) {
        ctx.beginPath();
        ctx.arc(xOf(hover.at), yOf(hover.pos), 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#10b981';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Taps recorded but not yet committed, drawn over the top of whatever they
    // are going to replace so the two can be compared before stopping.
    if (pendingActions && pendingActions.length > 0) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      pendingActions.forEach((a, i) => {
        const x = xOf(a.at);
        const y = yOf(a.pos);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      pendingActions.forEach((a) => {
        ctx.beginPath();
        ctx.arc(xOf(a.at), yOf(a.pos), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw center playhead (vertical line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    if (!actions || actions.length === 0) return;

    // Calculate interpolated position at current time to draw the moving dot
    const drag = dragRef.current;
    const actionAt = (i) => (
      drag && drag.moved && drag.index === i ? { at: drag.at, pos: drag.pos } : actions[i]
    );
    let currentPos = actions[0].pos;
    for (let i = 0; i < actions.length - 1; i++) {
      const a1 = actionAt(i);
      const a2 = actionAt(i + 1);
      if (timeMs >= a1.at && timeMs <= a2.at) {
        const progress = (timeMs - a1.at) / (a2.at - a1.at);
        currentPos = a1.pos + (a2.pos - a1.pos) * progress;
        break;
      }
      if (timeMs > a2.at) currentPos = a2.pos;
    }

    // Draw glowing center dot
    ctx.beginPath();
    ctx.arc(w / 2, yOf(currentPos), 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0; // reset
    ctx.strokeStyle = '#ec4899'; // pink ring
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  // Repaint using whatever time is current, without waiting for React. The
  // pointer handlers call this so hovering and dragging stay smooth while the
  // video is paused and no animation frame is running.
  const redraw = () => {
    draw(videoRef?.current ? videoRef.current.currentTime * 1000 : currentTimeMs);
  };

  const animate = () => {
    if (videoRef && videoRef.current) {
      draw(videoRef.current.currentTime * 1000);
    }
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      redraw();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, actions, pendingActions, currentTimeMs, videoRef, windowMs, editMode, selectedIndex, range]);

  // --- Pointer handling -----------------------------------------------------

  // Pointer position in the script's own units, against the frame on screen.
  const pointerToScript = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return {
      at: drawnTimeRef.current - windowMs / 2 + fx * windowMs,
      pos: Math.max(0, Math.min(100, Math.round((1 - fy) * 100))),
      rect,
    };
  };

  // Nearest point to the pointer, in CSS pixels, or -1 if none is close
  // enough. Measuring in pixels rather than in milliseconds means the grab
  // radius matches what the eye sees at every zoom level.
  const hitTest = (e, rect) => {
    if (!actions || actions.length === 0) return -1;
    const startTime = drawnTimeRef.current - windowMs / 2;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best = -1;
    let bestDist = HIT_RADIUS_PX;
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.at < startTime - windowMs || a.at > startTime + windowMs * 2) continue;
      const x = ((a.at - startTime) / windowMs) * rect.width;
      const y = (1 - a.pos / 100) * rect.height;
      const dist = Math.hypot(x - px, y - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  // Delete is forgiving on purpose: the point does not have to be hit exactly,
  // the nearest one within a fraction of the window goes.
  const nearestTo = (timeMs) => {
    if (!actions) return -1;
    let best = -1;
    let bestDiff = Math.min(500, windowMs / 12);
    for (let i = 0; i < actions.length; i++) {
      const diff = Math.abs(actions[i].at - timeMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return best;
  };

  const seekTo = (timeMs) => {
    const video = videoRef?.current;
    if (!video || !video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration, timeMs / 1000));
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    const { at, rect } = pointerToScript(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (editMode === 'select') {
      marqueeRef.current = { startAt: at, endAt: at };
      setRange(null);
      return;
    }

    const index = (editMode === 'add' || editMode === 'delete') ? hitTest(e, rect) : -1;
    if (index !== -1 && onMovePoint) {
      dragRef.current = {
        index,
        at: actions[index].at,
        pos: actions[index].pos,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      return;
    }

    // Nothing under the pointer: the gesture is a scrub until it turns out to
    // have been a click.
    scrubRef.current = { startX: e.clientX, startTime: drawnTimeRef.current, moved: false };
  };

  const handlePointerMove = (e) => {
    const { at, pos, rect } = pointerToScript(e);

    if (marqueeRef.current) {
      marqueeRef.current.endAt = at;
      redraw();
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (drag.moved) {
        // Clamp between the neighbours so a point can never be dragged past
        // one: the actions array has to stay in time order, and keeping the
        // index fixed is what lets the drag be previewed without committing.
        const prev = actions[drag.index - 1];
        const next = actions[drag.index + 1];
        const lo = prev ? prev.at + 1 : 0;
        const hi = next ? next.at - 1 : at;
        drag.at = Math.round(Math.max(lo, Math.min(hi, at)));
        drag.pos = pos;
      }
      redraw();
      return;
    }

    const scrub = scrubRef.current;
    if (scrub) {
      const dx = e.clientX - scrub.startX;
      if (!scrub.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) scrub.moved = true;
      if (scrub.moved) {
        // Anchored to where the press landed, so the bar does not chase the
        // pointer as the window re-centres on the new time.
        seekTo(scrub.startTime - (dx / rect.width) * windowMs);
      }
      return;
    }

    if (editMode === 'view' || editMode === 'select') return;
    const index = hitTest(e, rect);
    const hover = hoverRef.current;
    if (!hover || hover.index !== index || index === -1) {
      hoverRef.current = { index, at, pos };
      redraw();
    }
  };

  const handlePointerUp = (e) => {
    // Only the primary button acts. A right-click raises pointerup too, and
    // without this it ran the mode's click action on top of the delete that
    // the context menu had just done — in Add mode, putting back the point it
    // had removed.
    if (e.button !== 0) return;

    const marquee = marqueeRef.current;
    const drag = dragRef.current;
    const scrub = scrubRef.current;
    marqueeRef.current = null;
    dragRef.current = null;
    scrubRef.current = null;

    if (marquee) {
      const startMs = Math.min(marquee.startAt, marquee.endAt);
      const endMs = Math.max(marquee.startAt, marquee.endAt);
      setRange(endMs - startMs >= MIN_SELECTION_MS ? { startMs, endMs } : null);
      return;
    }

    if (drag) {
      if (drag.moved) {
        onMovePoint(drag.index, drag.at, drag.pos);
        setSelectedIndex(drag.index);
      } else if (editMode === 'delete') {
        onRemovePoint(drag.index);
      } else {
        // Clicking a point you can already see is a request to work on it, not
        // to stack another one on top.
        setSelectedIndex(prev => (prev === drag.index ? null : drag.index));
      }
      return;
    }

    if (scrub && scrub.moved) return; // that was a scrub, not a click

    const { at, pos } = pointerToScript(e);
    if (editMode === 'add') {
      if (onAddPoint) onAddPoint(at, pos);
    } else if (editMode === 'delete') {
      const index = nearestTo(at);
      if (index !== -1 && onRemovePoint) onRemovePoint(index);
    } else if (editMode === 'view') {
      seekTo(at);
    }
  };

  // Right-click always deletes, whichever mode is selected: fixing an unwanted
  // point is the edit you make most while adding them, and swapping modes for
  // each one gets old quickly.
  const handleContextMenu = (e) => {
    e.preventDefault();
    if (editMode === 'view' || !onRemovePoint) return;
    const { at } = pointerToScript(e);
    const index = nearestTo(at);
    if (index !== -1) onRemovePoint(index);
  };

  const handlePointerLeave = () => {
    if (dragRef.current || scrubRef.current || marqueeRef.current) return;
    if (hoverRef.current) {
      hoverRef.current = null;
      redraw();
    }
  };

  // --- Keyboard: fine-tune the selected point -------------------------------

  useEffect(() => {
    if (selectedIndex === null) return undefined;

    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const point = actions && actions[selectedIndex];
      if (!point) return;

      const scale = e.shiftKey ? NUDGE_COARSE : 1;
      let at = point.at;
      let pos = point.pos;

      switch (e.key) {
        case 'ArrowLeft': at -= NUDGE_MS * scale; break;
        case 'ArrowRight': at += NUDGE_MS * scale; break;
        case 'ArrowUp': pos += NUDGE_POS * scale; break;
        case 'ArrowDown': pos -= NUDGE_POS * scale; break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onRemovePoint(selectedIndex);
          setSelectedIndex(null);
          return;
        case 'Escape':
          setSelectedIndex(null);
          return;
        default:
          return;
      }

      // The arrows would otherwise scroll the page, or seek the video when it
      // holds focus — which is exactly the key a user reaches for next.
      e.preventDefault();
      onMovePoint(selectedIndex, at, Math.max(0, Math.min(100, pos)), 'nudge');
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndex, actions, onMovePoint, onRemovePoint]);

  const activeMode = MODES.find(m => m.id === editMode) || MODES[0];
  const selectedPoint = selectedIndex !== null && actions ? actions[selectedIndex] : null;
  const runOp = (fn) => { fn(); setRange(null); };

  return (
    <div className="group w-full h-32 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden relative shadow-inner">
      <canvas
        ref={canvasRef}
        width={1000}
        height={128}
        className={`w-full h-full block touch-none ${editMode === 'view' ? 'cursor-grab' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onContextMenu={handleContextMenu}
        title={activeMode.hint}
      />
      {/* Decorative gradient overlays for fade effect on edges */}
      <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-gray-900 to-transparent pointer-events-none"></div>
      <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-gray-900 to-transparent pointer-events-none"></div>

      {/* Zoom. The bar is only as tall as one stroke, so the controls sit on it
          rather than above it — vertical space here is the video's. */}
      <div className="absolute top-2 left-3 flex items-center gap-1 bg-gray-900/80 rounded px-1 py-0.5 border border-gray-700/60 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => zoom(-1)}
          disabled={windowIndex === 0}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={13} />
        </button>
        <span className="text-[10px] font-mono text-gray-400 w-8 text-center select-none">
          {(windowMs / 1000).toFixed(windowMs < 10000 ? 1 : 0)}s
        </span>
        <button
          onClick={() => zoom(1)}
          disabled={windowIndex === WINDOW_STEPS_MS.length - 1}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={13} />
        </button>
      </div>

      {/* What a click does. Only the active mode is named: four labels at once
          cover a third of the bar. */}
      <div className="absolute top-2 right-3 flex items-center gap-0.5 bg-gray-900/80 rounded px-1 py-0.5 border border-gray-700/60 opacity-60 group-hover:opacity-100 transition-opacity">
        {MODES.map(({ id, Icon, label, hint }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors ${
              editMode === id
                ? 'bg-pink-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title={hint}
          >
            <Icon size={13} />
            {editMode === id && <span>{label}</span>}
          </button>
        ))}
      </div>

      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-pink-400 bg-gray-900/80 px-2 py-1 rounded border border-pink-500/30 pointer-events-none">
        NOW
      </div>

      {/* The selected point's own readout, so a nudge can be aimed rather than
          eyeballed. */}
      {selectedPoint && (
        <div className="absolute bottom-2 left-3 text-[10px] font-mono text-yellow-300 bg-gray-900/85 px-2 py-0.5 rounded border border-yellow-500/40 pointer-events-none">
          {(selectedPoint.at / 1000).toFixed(2)}s · {selectedPoint.pos} — arrows nudge, Del removes
        </div>
      )}

      {!selectedPoint && editMode !== 'view' && editMode !== 'select' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500 bg-gray-900/70 px-2 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          drag a point to move it · drag the background to scrub · right-click deletes
        </div>
      )}

      {/* Range toolbar. Fixed to the bar rather than to the selection, which
          slides away under it as the video plays. */}
      {range && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 bg-gray-800/95 border border-gray-600 rounded-lg shadow-lg px-2 py-1 flex items-center gap-1.5 flex-wrap justify-center max-w-[95%]">
          <span className="text-[10px] text-gray-300 font-mono">
            {(range.startMs / 1000).toFixed(1)}–{(range.endMs / 1000).toFixed(1)}s
          </span>
          {onRegenerateSelection && (
            <button
              onClick={() => runOp(() => onRegenerateSelection(range.startMs, range.endMs))}
              className="text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={10} /> Regenerate
            </button>
          )}
          {RANGE_OPS.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => runOp(() => onModifySelection(range.startMs, range.endMs, type))}
              className="text-[10px] font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 px-1.5 py-1 rounded transition-colors"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setRange(null)}
            className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-700 transition-colors"
            title="Clear selection"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
