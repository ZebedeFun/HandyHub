import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import { setSpeed, setStrokeZone, stopHamp } from '../../services/handyService';

// Cartoon Boobs SVG Component
const BoobsSVG = ({ className }) => (
  <svg viewBox="0 0 100 60" className={className}>
    <circle cx="30" cy="30" r="28" fill="#FFB6C1" stroke="#FF69B4" strokeWidth="2" />
    <circle cx="30" cy="30" r="8" fill="#FF69B4" />
    <circle cx="30" cy="30" r="3" fill="#C71585" />
    <circle cx="70" cy="30" r="28" fill="#FFB6C1" stroke="#FF69B4" strokeWidth="2" />
    <circle cx="70" cy="30" r="8" fill="#FF69B4" />
    <circle cx="70" cy="30" r="3" fill="#C71585" />
    <path d="M 50 15 Q 50 30 50 45" stroke="#FF69B4" strokeWidth="2" fill="none" opacity="0.5" />
  </svg>
);

export default function GameMode({ isDarkMode, toggleTheme, settings, openSettings }) {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState('idle');
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  
  // Game Configuration State
  const [minSpeed, setMinSpeed] = useState(() => Number(localStorage.getItem('gameMinSpeed')) || 20);
  const [maxSpeed, setMaxSpeed] = useState(() => Number(localStorage.getItem('gameMaxSpeed')) || 100);
  const [minDepth, setMinDepth] = useState(() => Number(localStorage.getItem('gameMinDepth')) || 30);
  const [maxDepth, setMaxDepth] = useState(() => Number(localStorage.getItem('gameMaxDepth')) || 100);

  useEffect(() => {
    localStorage.setItem('gameMinSpeed', minSpeed);
    localStorage.setItem('gameMaxSpeed', maxSpeed);
    localStorage.setItem('gameMinDepth', minDepth);
    localStorage.setItem('gameMaxDepth', maxDepth);
  }, [minSpeed, maxSpeed, minDepth, maxDepth]);

  const [backgrounds, setBackgrounds] = useState([]);
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    fetch('/api/backgrounds')
      .then(res => res.json())
      .then(data => {
        if (data.images && data.images.length > 0) {
          setBackgrounds(data.images);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (backgrounds.length > 1) {
      const interval = setInterval(() => {
        setBgIndex(prev => (prev + 1) % backgrounds.length);
      }, 10000); // Change every 10 seconds
      return () => clearInterval(interval);
    }
  }, [backgrounds]);

  const [items, setItems] = useState([]);
  
  const itemsRef = useRef([]);
  const intensityRef = useRef(0); // Scales from 0 to 100
  const scoreRef = useRef(0);
  const startTimeRef = useRef(0);
  
  // Special status effects
  const trapEndTimeRef = useRef(0);
  const restEndTimeRef = useRef(0);
  const wasTrappedRef = useRef(false);
  const wasRestingRef = useRef(false);
  
  const handyKey = settings?.handyKey;

  const difficultyMultiplier = {
    easy: 1,
    medium: 2,
    hard: 3
  };

  // Helper functions to map 0-100 intensity to user's min/max bounds
  const getActualSpeed = (intensity) => Math.round(minSpeed + (maxSpeed - minSpeed) * (intensity / 100));
  const getActualDepth = (intensity) => Math.round(minDepth + (maxDepth - minDepth) * (intensity / 100));

  const applyHandyState = (intensity) => {
    const s = getActualSpeed(intensity);
    const d = getActualDepth(intensity);
    setStrokeZone(handyKey, 100 - d, 100);
    setSpeed(handyKey, s);
  };

  const startGame = () => {
    if (!handyKey) {
      alert("Please set your Handy Connection Key in Settings first.");
      openSettings();
      return;
    }
    
    setScore(0);
    setItems([]);
    itemsRef.current = [];
    intensityRef.current = 0; // Start at baseline
    scoreRef.current = 0;
    trapEndTimeRef.current = 0;
    restEndTimeRef.current = 0;
    wasTrappedRef.current = false;
    wasRestingRef.current = false;
    startTimeRef.current = performance.now();
    
    applyHandyState(intensityRef.current);
    
    setGameState('playing');
  };
  
  const stopGame = () => {
    setGameState('gameover');
    stopHamp(handyKey);
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    let animationFrameId;
    let lastTime = performance.now();
    let lastPenaltyTime = performance.now();

    const loop = (time) => {
      const deltaTime = Math.min(time - lastTime, 50);
      lastTime = time;
      
      const diffMult = difficultyMultiplier[difficulty] || 2;
      const gameTimeSeconds = (time - startTimeRef.current) / 1000;
      
      const isResting = time < restEndTimeRef.current;
      const isTrapped = time < trapEndTimeRef.current;

      // Handle transitions back to normal intensity
      if (!isTrapped && wasTrappedRef.current) {
         applyHandyState(intensityRef.current);
         lastPenaltyTime = time;
         wasTrappedRef.current = false;
      }
      if (isTrapped) wasTrappedRef.current = true;

      if (!isResting && wasRestingRef.current) {
         applyHandyState(intensityRef.current);
         lastPenaltyTime = time;
         wasRestingRef.current = false;
      }
      if (isResting) wasRestingRef.current = true;

      // Spawning logic (only if not resting)
      if (!isResting) {
        const timeMultiplier = 1 + (gameTimeSeconds / 60); 
        const spawnChance = (0.015 * diffMult * timeMultiplier) * (deltaTime / 16.66);
        
        if (Math.random() < spawnChance) {
          let type = 'boobs';
          const r = Math.random();
          
          if (gameTimeSeconds > 30 && r < 0.05) {
            type = 'bomb';
          } else if (gameTimeSeconds > 20 && r < 0.15) {
            type = 'splitter';
          } else if (gameTimeSeconds > 10 && r < 0.3) {
            type = 'trap';
          }

          itemsRef.current.push({
            id: Math.random().toString(36).substr(2, 9),
            type,
            x: 10 + Math.random() * 80, 
            y: -10, 
            speedX: 0,
            speedY: 10 + Math.random() * 15 * diffMult * timeMultiplier
          });
        }
      }
      
      // Update positions
      let missedCount = 0;
      itemsRef.current = itemsRef.current.map(item => {
        let newX = item.x;
        let newY = item.y;
        let newSpeedY = item.speedY;

        if (item.type === 'small') {
           newX += item.speedX * (deltaTime / 1000);
           newY += item.speedY * (deltaTime / 1000);
           newSpeedY += 40 * (deltaTime / 1000); // Gravity
           
           if (newX < 2 || newX > 98) {
               item.speedX = -item.speedX;
               newX = Math.max(2, Math.min(98, newX));
           }
           return { ...item, x: newX, y: newY, speedX: item.speedX, speedY: newSpeedY };
        } else {
           newY += item.speedY * (deltaTime / 1000);
        }

        if (newY > 110 && (item.type === 'boobs' || item.type === 'splitter' || item.type === 'small')) {
            missedCount++;
        }
        
        return { ...item, y: newY };
      }).filter(item => item.y <= 110);
      
      // Penalty and Device Logic
      if (isTrapped) {
         if (time - lastPenaltyTime > 1000) {
            applyHandyState(100); // Force max intensity
            lastPenaltyTime = time;
         }
      } else if (isResting) {
         if (time - lastPenaltyTime > 1000) {
            applyHandyState(0); // Force baseline during rest
            lastPenaltyTime = time;
         }
      } else {
        if (missedCount > 0 || itemsRef.current.filter(i => i.type !== 'trap').length > 5) {
          if (time - lastPenaltyTime > 1000) {
            const penalty = missedCount * 2 + (itemsRef.current.length > 5 ? 2 : 0);
            intensityRef.current = Math.min(100, intensityRef.current + penalty * diffMult);
            applyHandyState(intensityRef.current);
            
            lastPenaltyTime = time;
          }
        }
      }
      
      setItems([...itemsRef.current]);
      
      const activeTargets = itemsRef.current.filter(i => i.type !== 'trap').length;
      if (activeTargets > 30) {
        stopGame();
        return;
      }
      
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, difficulty, handyKey, minSpeed, maxSpeed, minDepth, maxDepth]);

  const handleItemClick = (e, item) => {
    e.preventDefault();
    if (gameState !== 'playing') return;
    
    const now = performance.now();
    itemsRef.current = itemsRef.current.filter(i => i.id !== item.id);

    if (item.type === 'trap') {
      trapEndTimeRef.current = now + 3000;
      applyHandyState(100); // Instant max intensity burst
      return;
    }

    if (item.type === 'bomb') {
      itemsRef.current = [];
      scoreRef.current += 50;
      restEndTimeRef.current = now + 3000;
      intensityRef.current = intensityRef.current * 0.666; // Reduce to 2/3rds
      applyHandyState(0); // Instantly drop to baseline for the rest period
      setScore(scoreRef.current);
      return;
    }

    if (item.type === 'splitter') {
      scoreRef.current += 15;
      const gameTimeSeconds = (now - startTimeRef.current) / 1000;
      const numSplits = gameTimeSeconds > 40 ? Math.floor(3 + Math.random() * 2) : 2; 
      
      for (let i = 0; i < numSplits; i++) {
         itemsRef.current.push({
           id: Math.random().toString(36).substr(2, 9),
           type: 'small',
           x: item.x,
           y: item.y,
           speedX: -20 + Math.random() * 40,
           speedY: -20 - Math.random() * 20
         });
      }
    } else {
      scoreRef.current += (item.type === 'small' ? 20 : 10);
    }
    
    setScore(scoreRef.current);
    
    if (itemsRef.current.filter(i => i.type !== 'trap').length === 0 && now > trapEndTimeRef.current && now > restEndTimeRef.current) {
       intensityRef.current = Math.max(0, intensityRef.current - 5);
       applyHandyState(intensityRef.current);
    }
  };

  const renderItem = (item) => {
    switch (item.type) {
      case 'boobs': return <BoobsSVG className="w-16 h-16 drop-shadow-lg" />;
      case 'small': return <BoobsSVG className="w-8 h-8 drop-shadow-md" />;
      case 'trap':
        return (
          <div className="w-14 h-14 bg-red-600 rounded-lg flex items-center justify-center border-4 border-red-800 shadow-[0_0_15px_rgba(220,38,38,0.8)] animate-pulse">
            <span className="text-white font-extrabold text-2xl">!</span>
          </div>
        );
      case 'splitter':
        return (
          <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center border-4 border-purple-300 shadow-lg">
             <span className="text-white text-2xl">✂️</span>
          </div>
        );
      case 'bomb':
        return (
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center border-4 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.6)]">
             <span className="text-3xl animate-bounce">💣</span>
          </div>
        );
      default:
        return <div className="w-12 h-12 bg-gray-500 rounded-full" />;
    }
  };

  return (
    <div className={`flex flex-col min-h-screen ${backgrounds.length > 0 ? 'bg-white/60 dark:bg-black/80 backdrop-blur-sm' : 'bg-gray-50 dark:bg-gray-900'} transition-colors text-gray-900 dark:text-white`}>
      {backgrounds.length > 0 && backgrounds.map((bg, index) => (
         <div 
           key={bg}
           className={`fixed inset-0 -z-10 bg-cover bg-center transition-opacity duration-[2000ms] ease-in-out ${index === bgIndex ? 'opacity-100' : 'opacity-0'}`}
           style={{ backgroundImage: `url(${bg})` }}
         />
      ))}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Game Mode</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={openSettings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-6">
        <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 flex flex-col items-center flex-grow">
        {gameState === 'idle' && (
          <div className="text-center w-full max-w-md my-auto">
            <h2 className="text-2xl font-bold mb-4">Are you ready?</h2>
            
            <div className="text-sm text-left bg-gray-100 dark:bg-gray-700 p-4 rounded-xl mb-6 shadow-inner border border-gray-200 dark:border-gray-600">
               <ul className="space-y-2">
                 <li className="flex items-center gap-2"><BoobsSVG className="w-6 h-6" /> <strong>Targets:</strong> Click them!</li>
                 <li className="flex items-center gap-2"><span className="text-lg">✂️</span> <strong>Splitters:</strong> Break into smaller targets.</li>
                 <li className="flex items-center gap-2"><span className="text-lg">💣</span> <strong>The Bomb (Rare):</strong> Clears screen, 3s rest!</li>
                 <li className="flex items-center gap-2"><span className="text-red-500 font-bold bg-red-100 px-2 rounded">!</span> <strong>The Trap:</strong> DO NOT CLICK! Causes a 3s max-intensity burst.</li>
               </ul>
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 p-5 rounded-xl mb-6 shadow-inner border border-gray-200 dark:border-gray-600 text-left">
              <h3 className="font-bold text-lg mb-4 border-b border-gray-300 dark:border-gray-500 pb-2">Device Limits</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold mb-2">Min Speed: {minSpeed}%</label>
                    <input type="range" min="0" max={maxSpeed - 1} value={minSpeed} onChange={e => setMinSpeed(Number(e.target.value))} className="w-full accent-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2">Max Speed: {maxSpeed}%</label>
                    <input type="range" min={minSpeed + 1} max="100" value={maxSpeed} onChange={e => setMaxSpeed(Number(e.target.value))} className="w-full accent-red-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold mb-2">Min Depth: {minDepth}%</label>
                    <input type="range" min="0" max={maxDepth - 1} value={minDepth} onChange={e => setMinDepth(Number(e.target.value))} className="w-full accent-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2">Max Depth: {maxDepth}%</label>
                    <input type="range" min={minDepth + 1} max="100" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))} className="w-full accent-red-500" />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-8 flex justify-center gap-4">
              <label className="flex items-center gap-2 font-semibold">
                Difficulty:
                <select 
                  className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-2 font-normal focus:ring focus:ring-red-300"
                  value={difficulty} 
                  onChange={e => setDifficulty(e.target.value)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
            
            <button 
              onClick={startGame}
              className="bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold py-4 px-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform text-lg"
            >
              Start Game
            </button>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="w-full flex flex-col items-center flex-grow">
            <div className="w-full flex justify-between items-center mb-4 px-4 font-bold text-xl">
              <span className="text-blue-500">Score: {score}</span>
              
              {performance.now() < trapEndTimeRef.current && (
                 <span className="text-red-600 animate-pulse font-extrabold uppercase bg-red-100 px-4 py-1 rounded-full border-2 border-red-500">TRAPPED!</span>
              )}
              {performance.now() < restEndTimeRef.current && (
                 <span className="text-green-500 font-bold uppercase bg-green-100 px-4 py-1 rounded-full border-2 border-green-500">RESTING</span>
              )}

              <span className="text-red-500">
                 Speed: {performance.now() < trapEndTimeRef.current ? maxSpeed : getActualSpeed(intensityRef.current)}% | 
                 Depth: {performance.now() < trapEndTimeRef.current ? maxDepth : getActualDepth(intensityRef.current)}%
              </span>
            </div>
            
            <div className="relative w-full max-w-2xl flex-grow min-h-[500px] bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-inner select-none cursor-crosshair">
              {items.map(item => (
                <div 
                  key={item.id}
                  onPointerDown={(e) => handleItemClick(e, item)}
                  className={`absolute cursor-pointer hover:scale-110 active:scale-90 transition-transform flex items-center justify-center ${item.type === 'trap' ? 'z-10' : 'z-20'}`}
                  style={{ left: `${item.x}%`, top: `${item.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {renderItem(item)}
                </div>
              ))}
            </div>

            <button 
              onClick={stopGame}
              className="mt-6 bg-gray-800 dark:bg-gray-700 text-white font-bold py-2 px-8 rounded-full shadow hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors"
            >
              Stop Game
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="text-center my-auto">
            <h2 className="text-5xl font-extrabold mb-4 text-red-500">Game Over</h2>
            <p className="text-2xl mb-8 text-gray-700 dark:text-gray-300">Final Score: <span className="font-bold text-blue-500">{score}</span></p>
            <button 
              onClick={() => setGameState('idle')}
              className="bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold py-4 px-10 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform text-lg"
            >
              Configure & Play Again
            </button>
          </div>
        )}
        )}
      </main>
    </div>
  );
}
