import React, { useRef, useEffect, useState } from 'react';
import { Eye, Plus, Eraser, ZoomIn, ZoomOut } from 'lucide-react';

const getSpeedColor = (deltaPos, deltaMs) => {
  if (deltaMs === 0) return '#3b82f6';
  const speed = Math.abs(deltaPos) / (deltaMs / 1000);
  if (speed < 50) return '#3b82f6'; // Blue
  if (speed < 100) return '#10b981'; // Green
  if (speed < 150) return '#eab308'; // Yellow
  if (speed < 200) return '#f97316'; // Orange
  return '#ef4444'; // Red
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

const MODES = [
  { id: 'view', Icon: Eye, label: 'View', hint: 'View only — clicks do nothing' },
  { id: 'add', Icon: Plus, label: 'Add', hint: 'Click to add a point (drag one to move it)' },
  { id: 'delete', Icon: Eraser, label: 'Delete', hint: 'Click to delete the nearest point (drag one to move it)' },
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
  currentTimeMs,
  isPlaying,
  videoRef,
  onRemovePoint,
  onAddPoint,
  onMovePoint,
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

  // Hover and drag live in refs, not state: both change on every pointermove,
  // and they only ever affect what the canvas paints. Re-rendering for them
  // would mean a React pass per mouse movement for no benefit.
  const hoverRef = useRef(null); // { index, at, pos } — index -1 when over empty space
  const dragRef = useRef(null);  // { index, at, pos, startX, startY, moved }

  // The time the last frame was painted for. Pointer coordinates are converted
  // back to times against this, so a click always means what the user saw,
  // even mid-playback when the video has already moved on.
  const drawnTimeRef = useRef(0);

  const setMode = (id) => {
    setEditMode(id);
    writeStored('handyscripter.timelineMode', id);
    hoverRef.current = null;
  };

  const zoom = (delta) => setWindowIndex(prev => {
    const next = Math.min(WINDOW_STEPS_MS.length - 1, Math.max(0, prev + delta));
    writeStored('handyscripter.timelineZoom', String(next));
    return next;
  });

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

    if (!actions || actions.length === 0) return;

    // Time boundaries
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
      ctx.beginPath();
      ctx.arc(xOf(a.at), yOf(a.pos), isActive ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#ec4899' : 'rgba(17, 24, 39, 0.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isActive ? '#fff' : 'rgba(255, 255, 255, 0.75)';
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

    // Draw center playhead (vertical line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Calculate interpolated position at current time to draw the moving dot
    let currentPos = 50;
    for (let i = startIndex; i < endIndex; i++) {
      const a1 = actionAt(i);
      const a2 = actionAt(i + 1);
      if (timeMs >= a1.at && timeMs <= a2.at) {
        const progress = (timeMs - a1.at) / (a2.at - a1.at);
        currentPos = a1.pos + (a2.pos - a1.pos) * progress;
        break;
      }
    }

    // If before the first action, or after the last one
    if (timeMs < actionAt(startIndex).at) currentPos = actionAt(startIndex).pos;
    if (timeMs > actionAt(endIndex).at) currentPos = actionAt(endIndex).pos;

    const dotY = yOf(currentPos);

    // Draw glowing center dot
    ctx.beginPath();
    ctx.arc(w / 2, dotY, 8, 0, Math.PI * 2);
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
    const drag = dragRef.current;
    if (!isPlaying || drag) {
      draw(videoRef?.current ? videoRef.current.currentTime * 1000 : currentTimeMs);
    }
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
      if (videoRef && videoRef.current) {
        draw(videoRef.current.currentTime * 1000);
      } else {
        draw(currentTimeMs);
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, actions, currentTimeMs, videoRef, windowMs, editMode]);

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

  const handlePointerDown = (e) => {
    if (editMode === 'view' || !actions || actions.length === 0) return;
    const { rect } = pointerToScript(e);
    const index = hitTest(e, rect);
    if (index !== -1 && onMovePoint) {
      dragRef.current = {
        index,
        at: actions[index].at,
        pos: actions[index].pos,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    const { at, pos, rect } = pointerToScript(e);

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

    if (editMode === 'view') return;
    const index = hitTest(e, rect);
    const hover = hoverRef.current;
    if (!hover || hover.index !== index || index === -1) {
      hoverRef.current = { index, at, pos };
      redraw();
    }
  };

  const handlePointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;

    if (drag && drag.moved) {
      onMovePoint(drag.index, drag.at, drag.pos);
      return;
    }
    if (editMode === 'view') return;

    const { at, pos } = pointerToScript(e);
    if (editMode === 'add') {
      // A press that started on a point was a grab, not an add — releasing it
      // without moving should leave the script alone rather than stack a
      // second point on top of the first.
      if (!drag && onAddPoint) onAddPoint(at, pos);
    } else if (editMode === 'delete') {
      if (onRemovePoint) onRemovePoint(drag ? drag.index : hitTestOrNearest(at));
    }
  };

  // Delete is forgiving on purpose: the point does not have to be hit exactly,
  // the nearest one within half a second of the click goes.
  const hitTestOrNearest = (timeMs) => {
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

  // Right-click always deletes, whichever mode is selected: fixing an unwanted
  // point is the edit you make most while adding them, and swapping modes for
  // each one gets old quickly.
  const handleContextMenu = (e) => {
    e.preventDefault();
    if (editMode === 'view' || !onRemovePoint) return;
    const { at } = pointerToScript(e);
    const index = hitTestOrNearest(at);
    if (index !== -1) onRemovePoint(index);
  };

  const handlePointerLeave = () => {
    if (dragRef.current) return;
    if (hoverRef.current) {
      hoverRef.current = null;
      redraw();
    }
  };

  const activeMode = MODES.find(m => m.id === editMode) || MODES[0];
  const cursor = editMode === 'view' ? 'cursor-default' : 'cursor-crosshair';

  return (
    <div className="group w-full h-32 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden relative shadow-inner">
      <canvas
        ref={canvasRef}
        width={1000}
        height={128}
        className={`w-full h-full block touch-none ${cursor}`}
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

      {/* What a click does. */}
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
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-pink-400 bg-gray-900/80 px-2 py-1 rounded border border-pink-500/30 pointer-events-none">
        NOW
      </div>

      {editMode !== 'view' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500 bg-gray-900/70 px-2 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          drag a point to move it · right-click deletes
        </div>
      )}
    </div>
  );
}
