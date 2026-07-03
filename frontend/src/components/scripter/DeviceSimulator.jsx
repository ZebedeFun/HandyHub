import React, { useState, useEffect, useRef } from 'react';

// Linear interpolation to find the exact position at a given time
const interpolatePosition = (actions, timeMs) => {
  if (!actions || actions.length === 0) return 0;
  if (timeMs <= actions[0].at) return actions[0].pos;
  if (timeMs >= actions[actions.length - 1].at) return actions[actions.length - 1].pos;

  // Find the current segment
  // For production with huge arrays, a binary search is better, 
  // but a linear search is okay for procedural scripts of typical length
  let startIdx = 0;
  for (let i = 0; i < actions.length - 1; i++) {
    if (timeMs >= actions[i].at && timeMs <= actions[i+1].at) {
      startIdx = i;
      break;
    }
  }
  
  const start = actions[startIdx];
  const end = actions[startIdx + 1];
  
  const timeDiff = end.at - start.at;
  if (timeDiff === 0) return start.pos;
  
  const progress = (timeMs - start.at) / timeDiff;
  return start.pos + progress * (end.pos - start.pos);
};

export default function DeviceSimulator({ actions, isPlaying, videoRef }) {
  const [currentPos, setCurrentPos] = useState(0);
  const requestRef = useRef();

  const animate = () => {
    if (videoRef.current && actions && actions.length > 0) {
      const timeMs = videoRef.current.currentTime * 1000;
      const pos = interpolatePosition(actions, timeMs);
      setCurrentPos(pos);
    }
    
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      // Run once when paused to ensure correct position on seek
      if (videoRef.current && actions) {
         setCurrentPos(interpolatePosition(actions, videoRef.current.currentTime * 1000));
      }
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, actions, videoRef]);

  // Position is 0 (bottom) to 100 (top) of the stroke. 
  // Wait, funscript: 0 is usually the bottom (fully extended down), 100 is top (fully retracted up).
  // CSS: bottom: `${currentPos}%` works perfectly for this visual.

  return (
    <div className="absolute right-4 top-4 bottom-4 w-16 flex justify-center pointer-events-none drop-shadow-2xl opacity-90 transition-opacity">
      {/* The Track (representing the device body) */}
      <div className="w-8 h-full bg-gray-800 rounded-full relative border-2 border-gray-700 shadow-inner overflow-hidden">
        
        {/* The Sleeve (moving part) */}
        <div 
          className="absolute left-0 w-full bg-gradient-to-t from-pink-600 to-pink-400 rounded-full shadow-[0_0_15px_rgba(219,39,119,0.7)]"
          style={{ 
            height: '25%', // represents the length of the sleeve
            bottom: `${currentPos}%`,
            transform: `translateY(12.5%)`, // Offset so 0% doesn't fall off the bottom, and 100% doesn't fall off the top
            transition: isPlaying ? 'none' : 'bottom 0.2s ease-out' // Smooth only when scrubbing manually
          }}
        >
          {/* Stylized ribs on the sleeve */}
          <div className="absolute top-1/4 left-1 w-5 h-0.5 bg-pink-300 opacity-50 rounded"></div>
          <div className="absolute top-2/4 left-1 w-5 h-0.5 bg-pink-300 opacity-50 rounded"></div>
          <div className="absolute top-3/4 left-1 w-5 h-0.5 bg-pink-300 opacity-50 rounded"></div>
        </div>
      </div>
    </div>
  );
}
