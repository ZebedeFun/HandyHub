import React, { useRef, useEffect } from 'react';

const getSpeedColor = (deltaPos, deltaMs) => {
  if (deltaMs === 0) return '#3b82f6';
  const speed = Math.abs(deltaPos) / (deltaMs / 1000);
  if (speed < 50) return '#3b82f6'; // Blue
  if (speed < 100) return '#10b981'; // Green
  if (speed < 150) return '#eab308'; // Yellow
  if (speed < 200) return '#f97316'; // Orange
  return '#ef4444'; // Red
};

export default function ScrollingTimeline({ actions, currentTimeMs, isPlaying, videoRef }) {
  const canvasRef = useRef(null);
  const requestRef = useRef();
  
  // Total time window to display in ms (e.g. 6 seconds total: 3s left, 3s right)
  const windowMs = 6000; 

  const draw = (timeMs) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    if (!actions || actions.length === 0) return;

    // Time boundaries
    const startTime = timeMs - windowMs / 2;
    const endTime = timeMs + windowMs / 2;

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

    // Draw vertical grid lines (every 1 second)
    const firstSec = Math.floor(startTime / 1000) * 1000;
    ctx.beginPath();
    for (let t = firstSec; t <= endTime; t += 1000) {
      const x = ((t - startTime) / windowMs) * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    // Find actions within or overlapping the window
    let startIndex = 0;
    let endIndex = actions.length - 1;

    for (let i = 0; i < actions.length; i++) {
      if (actions[i].at >= startTime) {
        startIndex = Math.max(0, i - 1);
        break;
      }
    }
    for (let i = startIndex; i < actions.length; i++) {
      if (actions[i].at > endTime) {
        endIndex = i;
        break;
      }
    }

    const visibleActions = actions.slice(startIndex, endIndex + 1);

    // Draw the script line
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < visibleActions.length - 1; i++) {
      const current = visibleActions[i];
      const next = visibleActions[i + 1];

      const startX = ((current.at - startTime) / windowMs) * w;
      const startY = h - (current.pos / 100) * h;
      const endX = ((next.at - startTime) / windowMs) * w;
      const endY = h - (next.pos / 100) * h;

      const color = getSpeedColor(next.pos - current.pos, next.at - current.at);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
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
    for (let i = 0; i < visibleActions.length - 1; i++) {
      const a1 = visibleActions[i];
      const a2 = visibleActions[i + 1];
      if (timeMs >= a1.at && timeMs <= a2.at) {
        const progress = (timeMs - a1.at) / (a2.at - a1.at);
        currentPos = a1.pos + (a2.pos - a1.pos) * progress;
        break;
      }
    }
    
    // If before first action
    if (visibleActions.length > 0 && timeMs < visibleActions[0].at) currentPos = visibleActions[0].pos;
    // If after last action
    if (visibleActions.length > 0 && timeMs > visibleActions[visibleActions.length - 1].at) currentPos = visibleActions[visibleActions.length - 1].pos;

    const dotY = h - (currentPos / 100) * h;
    
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
  }, [isPlaying, actions, currentTimeMs, videoRef]);

  return (
    <div className="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden relative shadow-inner">
      <canvas 
        ref={canvasRef} 
        width={1200} 
        height={128} 
        className="w-full h-full block" 
      />
      {/* Decorative gradient overlays for fade effect on edges */}
      <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-gray-900 to-transparent pointer-events-none"></div>
      <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-gray-900 to-transparent pointer-events-none"></div>
      
      {/* Labels */}
      <div className="absolute top-2 left-4 text-xs font-mono text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
        -{(windowMs/2000).toFixed(1)}s
      </div>
      <div className="absolute top-2 right-4 text-xs font-mono text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
        +{(windowMs/2000).toFixed(1)}s
      </div>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-pink-400 bg-gray-900/80 px-2 py-1 rounded border border-pink-500/30">
        NOW
      </div>
    </div>
  );
}
