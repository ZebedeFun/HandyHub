import React, { useRef, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

// Utility to calculate speed and return a color
const getSpeedColor = (deltaPos, deltaMs) => {
  if (deltaMs === 0) return '#3b82f6';
  const speed = Math.abs(deltaPos) / (deltaMs / 1000); 
  if (speed < 50) return '#3b82f6';
  if (speed < 100) return '#10b981';
  if (speed < 150) return '#eab308';
  if (speed < 200) return '#f97316';
  return '#ef4444';
};

export default function Heatmap({ actions, durationMs, currentTimeMs, onRegenerateSelection }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!actions || actions.length === 0 || !durationMs) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background grid
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = i * (h / 4);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Draw the line graph
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < actions.length - 1; i++) {
      const current = actions[i];
      const next = actions[i + 1];

      const startX = (current.at / durationMs) * w;
      const startY = h - (current.pos / 100) * h;
      const endX = (next.at / durationMs) * w;
      const endY = h - (next.pos / 100) * h;

      const color = getSpeedColor(next.pos - current.pos, next.at - current.at);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // Draw playhead
    if (currentTimeMs !== undefined && currentTimeMs >= 0) {
      const playheadX = (currentTimeMs / durationMs) * w;
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }
  }, [actions, durationMs, currentTimeMs]);

  // Handle Selection Logic
  const getMsFromEvent = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * durationMs;
  };

  const handleMouseDown = (e) => {
    if (!durationMs) return;
    const ms = getMsFromEvent(e);
    setSelectionStart(ms);
    setSelectionEnd(ms);
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setSelectionEnd(getMsFromEvent(e));
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      let start = selectionStart;
      let end = selectionEnd;
      if (start > end) {
        start = selectionEnd;
        end = selectionStart;
        setSelectionStart(start);
        setSelectionEnd(end);
      }
      // Clear if too small
      if (end - start < 100) {
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    }
  };

  const hasSelection = selectionStart !== null && selectionEnd !== null && !isDragging;
  const start = Math.min(selectionStart || 0, selectionEnd || 0);
  const end = Math.max(selectionStart || 0, selectionEnd || 0);

  return (
    <div className="w-full h-full flex flex-col relative bg-gray-900 rounded-lg overflow-hidden shadow-inner border border-gray-700 select-none">
      
      {/* Floating Toolbar for active selection */}
      {hasSelection && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-gray-800 border border-gray-600 rounded-full shadow-lg px-3 py-1.5 flex items-center gap-3">
          <span className="text-xs text-gray-300 font-mono">
            {(start/1000).toFixed(1)}s - {(end/1000).toFixed(1)}s
          </span>
          <button 
            onClick={() => {
              onRegenerateSelection(start, end);
              setSelectionStart(null);
              setSelectionEnd(null);
            }}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={12} /> Regenerate Segment
          </button>
          <button 
            onClick={() => { setSelectionStart(null); setSelectionEnd(null); }}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div 
        ref={containerRef}
        className="flex-1 relative cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas 
          ref={canvasRef} 
          width={1000} 
          height={150} 
          className="w-full h-full block pointer-events-none" 
          style={{ imageRendering: 'pixelated' }}
        />
        
        {/* Selection Overlay */}
        {(selectionStart !== null && selectionEnd !== null) && (
          <div 
            className="absolute top-0 bottom-0 bg-blue-500/30 border-x border-blue-400 pointer-events-none"
            style={{
              left: `${(start / durationMs) * 100}%`,
              width: `${((end - start) / durationMs) * 100}%`
            }}
          />
        )}
      </div>

      <div className="px-2 py-1 text-xs text-gray-400 flex justify-between bg-gray-800 shrink-0 pointer-events-none">
        <span>0:00</span>
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Slow</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Fast</span>
        </div>
        <span>{durationMs ? (durationMs / 1000).toFixed(1) : '0.0'}s</span>
      </div>
    </div>
  );
}
