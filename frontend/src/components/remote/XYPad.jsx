import React, { useState, useRef, useEffect } from 'react';

export default function XYPad({ onChange, currentSpeed, currentStroke }) {
  const padRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: currentSpeed, y: currentStroke });

  // Update internal state if props change externally
  useEffect(() => {
    if (!isDragging) {
      setPosition({ x: currentSpeed, y: currentStroke });
    }
  }, [currentSpeed, currentStroke, isDragging]);

  const updatePosition = (clientX, clientY) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = 100 - (((clientY - rect.top) / rect.height) * 100); // Invert Y so top is 100

    // Clamp
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    const speed = Math.round(x);
    const stroke = Math.round(y);

    setPosition({ x: speed, y: stroke });
    onChange(speed, stroke);
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    e.target.setPointerCapture(e.pointerId);
    updatePosition(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (isDragging) {
      updatePosition(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="relative w-full aspect-square max-w-md mx-auto bg-gray-800 rounded-3xl overflow-hidden shadow-inner border border-gray-700 touch-none cursor-crosshair select-none"
      ref={padRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Grid Lines */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="w-full h-px bg-white absolute top-1/4"></div>
        <div className="w-full h-px bg-white absolute top-2/4"></div>
        <div className="w-full h-px bg-white absolute top-3/4"></div>
        <div className="h-full w-px bg-white absolute left-1/4"></div>
        <div className="h-full w-px bg-white absolute left-2/4"></div>
        <div className="h-full w-px bg-white absolute left-3/4"></div>
      </div>
      
      {/* Axes Labels */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-gray-500 font-bold uppercase tracking-widest text-xs pointer-events-none">
        Stroke
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-500 font-bold uppercase tracking-widest text-xs pointer-events-none">
        Speed
      </div>

      {/* The Puck */}
      <div 
        className="absolute w-12 h-12 -ml-6 -mb-6 rounded-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)] border-4 border-white pointer-events-none transition-transform"
        style={{
          left: `${position.x}%`,
          bottom: `${position.y}%`,
          transform: isDragging ? 'scale(1.2)' : 'scale(1)'
        }}
      ></div>
    </div>
  );
}
