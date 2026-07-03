import React, { useRef, useEffect } from 'react';

// Utility to calculate speed and return a color
// Speed = change in position / change in time
const getSpeedColor = (deltaPos, deltaMs) => {
  if (deltaMs === 0) return '#3b82f6'; // blue-500 fallback
  
  // Pos difference is up to 100. Time diff is usually 30-2000 ms.
  // Speed units: points per second.
  const speed = Math.abs(deltaPos) / (deltaMs / 1000); 
  
  // Adjusted thresholds for much faster speeds (max can be ~3000)
  if (speed < 150) return '#3b82f6'; // blue-500
  if (speed < 400) return '#10b981'; // emerald-500
  if (speed < 800) return '#eab308'; // yellow-500
  if (speed < 1500) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
};

export default function Heatmap({ actions, durationMs, currentTimeMs }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!actions || actions.length === 0 || !durationMs) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background grid
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.2)'; // gray-400 with opacity
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
      const startY = h - (current.pos / 100) * h; // Y is inverted on canvas
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

  return (
    <div className="w-full bg-gray-900 rounded-lg overflow-hidden shadow-inner border border-gray-700">
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={150} 
        className="w-full h-full block" 
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="px-2 py-1 text-xs text-gray-400 flex justify-between bg-gray-800">
        <span>0:00</span>
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Slow</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Fast</span>
        </div>
        <span>{(durationMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
