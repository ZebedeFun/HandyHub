import React, { useState, useEffect, useRef } from 'react';

export default function RemoteSimulator({ speed, deviceMin, deviceMax }) {
  const [currentPos, setCurrentPos] = useState(deviceMin);
  const requestRef = useRef();
  const lastTimeRef = useRef(0);
  const directionRef = useRef(1); // 1 = up, -1 = down

  // Keep sleeve within bounds if limits change abruptly
  useEffect(() => {
    setCurrentPos((prev) => Math.min(Math.max(prev, deviceMin), deviceMax));
  }, [deviceMin, deviceMax]);

  useEffect(() => {
    const animate = (time) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const strokeDistance = deviceMax - deviceMin;

      if (speed > 0 && strokeDistance > 0) {
        // Map speed 0-100 to a more realistic visual curve (0.2Hz to 3.5Hz)
        // Using a power curve makes lower speeds look appropriately gentle.
        const cyclesPerSecond = 0.2 + Math.pow(speed / 100, 1.5) * 3.3; 
        const percentPerSecond = cyclesPerSecond * 2 * strokeDistance; // distance covered per second
        
        const movement = (percentPerSecond * dt) / 1000;
        
        setCurrentPos((prev) => {
          let next = prev + movement * directionRef.current;
          
          // Constrain to the new stroke boundary
          if (next >= deviceMax) {
            next = deviceMax;
            directionRef.current = -1; // reverse to down
          } else if (next <= deviceMin) {
            next = deviceMin;
            directionRef.current = 1; // reverse to up
          }
          return next;
        });
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [speed, deviceMin, deviceMax]);

  return (
    <div className="flex justify-center items-center h-12 w-full my-2">
      {/* The Track (representing the full 0-100 device body) */}
      <div className="w-64 h-8 bg-gray-800 rounded-full relative border-2 border-gray-700 shadow-inner flex items-center overflow-hidden">
        
        {/* Draw faint limit lines so user can see their boundaries */}
        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-500 z-10" style={{ left: `${deviceMin * 0.8}%` }}></div>
        <div className="absolute top-0 bottom-0 border-r-2 border-dashed border-gray-500 z-10" style={{ right: `${100 - (deviceMax * 0.8 + 20)}%` }}></div>
        
        {/* Safe Zone Highlight */}
        <div className="absolute h-full bg-gray-700/50" style={{ left: `${deviceMin * 0.8}%`, right: `${100 - (deviceMax * 0.8 + 20)}%` }}></div>

        {/* The Sleeve (moving part) */}
        <div 
          className="absolute h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.7)] flex flex-col justify-center z-20 transition-none"
          style={{ 
            width: '20%', // visual width of sleeve
            left: `${currentPos * 0.8}%`,
          }}
        >
          {/* Stylized ribs on the sleeve */}
          <div className="absolute left-1/4 top-1 h-6 w-0.5 bg-emerald-300 opacity-50 rounded"></div>
          <div className="absolute left-2/4 top-1 h-6 w-0.5 bg-emerald-300 opacity-50 rounded"></div>
          <div className="absolute left-3/4 top-1 h-6 w-0.5 bg-emerald-300 opacity-50 rounded"></div>
        </div>
      </div>
    </div>
  );
}
