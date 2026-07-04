import React, { useState, useEffect, useRef } from 'react';

export default function RemoteSimulator({ speed, stroke }) {
  const [currentPos, setCurrentPos] = useState(0);
  const requestRef = useRef();
  const lastTimeRef = useRef(0);
  const directionRef = useRef(1); // 1 = up, -1 = down

  useEffect(() => {
    const animate = (time) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      if (speed > 0 && stroke > 0) {
        // Map speed 1-100 to 0.5Hz to 5Hz
        const cyclesPerSecond = 0.5 + (speed / 100) * 4.5; 
        const percentPerSecond = cyclesPerSecond * 2 * stroke; // distance covered per second
        
        const movement = (percentPerSecond * dt) / 1000;
        
        setCurrentPos((prev) => {
          let next = prev + movement * directionRef.current;
          
          // Constrain to the stroke boundary
          if (next >= stroke) {
            next = stroke;
            directionRef.current = -1; // reverse to down
          } else if (next <= 0) {
            next = 0;
            directionRef.current = 1; // reverse to up
          }
          return next;
        });
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [speed, stroke]);

  return (
    <div className="flex justify-center items-center h-32 w-full mt-4">
      {/* The Track (representing the device body) */}
      <div className="w-64 h-8 bg-gray-800 rounded-full relative border-2 border-gray-700 shadow-inner overflow-hidden flex items-center">
        
        {/* The Sleeve (moving part) */}
        <div 
          className="absolute h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.7)] flex flex-col justify-center"
          style={{ 
            width: '25%', // represents the length of the sleeve
            left: `${currentPos}%`,
            transform: `translateX(-12.5%)`, // Center it on the position
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
