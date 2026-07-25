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
  const [items, setItems] = useState([]);
  
  const itemsRef = useRef([]);
  const speedRef = useRef(20);
  const depthRef = useRef(30);
  const scoreRef = useRef(0);
  const startTimeRef = useRef(0);
  
  // Special status effects
  const trapEndTimeRef = useRef(0);
  const restEndTimeRef = useRef(0);
  
  const handyKey = settings?.handyKey;

  const difficultyMultiplier = {
    easy: 1,
    medium: 2,
    hard: 3
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
    speedRef.current = 20;
    depthRef.current = 30;
    scoreRef.current = 0;
    trapEndTimeRef.current = 0;
    restEndTimeRef.current = 0;
    startTimeRef.current = performance.now();
    
    setStrokeZone(handyKey, 100 - depthRef.current, 100);
    setSpeed(handyKey, speedRef.current);
    
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

      // Spawning logic (only if not resting)
      if (!isResting) {
        // As game progresses, spawn rate increases slightly
        const timeMultiplier = 1 + (gameTimeSeconds / 60); 
        const spawnChance = (0.015 * diffMult * timeMultiplier) * (deltaTime / 16.66);
        
        if (Math.random() < spawnChance) {
          // Determine item type based on time
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
           // Small items from splitters have gravity and X velocity
           newX += item.speedX * (deltaTime / 1000);
           newY += item.speedY * (deltaTime / 1000);
           newSpeedY += 40 * (deltaTime / 1000); // Gravity
           
           // Bounce off walls
           let newSpeedX = item.speedX;
           if (newX < 2 || newX > 98) {
               newSpeedX = -newSpeedX;
               newX = Math.max(2, Math.min(98, newX));
           }
           return { ...item, x: newX, y: newY, speedX: newSpeedX, speedY: newSpeedY };
        } else {
           // Normal falling
           newY += item.speedY * (deltaTime / 1000);
        }

        // Only count boobs and splitters as penalties if missed
        if (newY > 110 && (item.type === 'boobs' || item.type === 'splitter' || item.type === 'small')) {
            missedCount++;
        }
        
        return { ...item, y: newY };
      }).filter(item => item.y <= 110);
      
      // Penalty and Device Logic
      if (isTrapped) {
         // Force max speed and depth while trapped
         // We do this continuously or just let it ride, but to ensure it stays:
         if (time - lastPenaltyTime > 1000) {
            setStrokeZone(handyKey, 0, 100);
            setSpeed(handyKey, 100);
            lastPenaltyTime = time;
         }
      } else if (isResting) {
         // Keep it calm
         if (time - lastPenaltyTime > 1000) {
            setStrokeZone(handyKey, 100 - Math.round(depthRef.current), 100);
            setSpeed(handyKey, Math.round(speedRef.current));
            lastPenaltyTime = time;
         }
      } else {
        // Normal penalty progression
        if (missedCount > 0 || itemsRef.current.filter(i => i.type !== 'trap').length > 5) {
          if (time - lastPenaltyTime > 1000) {
            const penalty = missedCount * 2 + (itemsRef.current.length > 5 ? 2 : 0);
            speedRef.current = Math.min(100, speedRef.current + penalty * diffMult);
            depthRef.current = Math.min(100, depthRef.current + penalty * diffMult);
            
            setStrokeZone(handyKey, 100 - Math.round(depthRef.current), 100);
            setSpeed(handyKey, Math.round(speedRef.current));
            
            lastPenaltyTime = time;
          }
        }
      }
      
      setItems([...itemsRef.current]);
      
      // Check lose condition
      // Don't count traps towards the overwhelming limit, they are just obstacles
      const activeTargets = itemsRef.current.filter(i => i.type !== 'trap').length;
      if (activeTargets > 30) {
        stopGame();
        return;
      }
      
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState, difficulty, handyKey]);

  const handleItemClick = (e, item) => {
    // Prevent default to avoid drag issues
    e.preventDefault();
    if (gameState !== 'playing') return;
    
    const now = performance.now();
    
    // Remove the clicked item
    itemsRef.current = itemsRef.current.filter(i => i.id !== item.id);

    if (item.type === 'trap') {
      // TRAP! 3 seconds of max intensity
      trapEndTimeRef.current = now + 3000;
      setStrokeZone(handyKey, 0, 100);
      setSpeed(handyKey, 100);
      // Optional screen shake effect could be added here
      return;
    }

    if (item.type === 'bomb') {
      // BOMB! Clear screen, rest for 5 seconds, reset baseline
      itemsRef.current = [];
      scoreRef.current += 50;
      restEndTimeRef.current = now + 5000;
      speedRef.current = 20;
      depthRef.current = 30;
      setStrokeZone(handyKey, 70, 100);
      setSpeed(handyKey, 20);
      setScore(scoreRef.current);
      return;
    }

    if (item.type === 'splitter') {
      scoreRef.current += 15;
      // Spawn smaller items
      const gameTimeSeconds = (now - startTimeRef.current) / 1000;
      const numSplits = gameTimeSeconds > 40 ? Math.floor(3 + Math.random() * 2) : 2; // 2 early, 3-4 later
      
      for (let i = 0; i < numSplits; i++) {
         itemsRef.current.push({
           id: Math.random().toString(36).substr(2, 9),
           type: 'small',
           x: item.x,
           y: item.y,
           speedX: -20 + Math.random() * 40, // Burst outwards horizontally
           speedY: -20 - Math.random() * 20  // Burst upwards initially
         });
      }
    } else {
      // Normal boobs or small boobs
      scoreRef.current += (item.type === 'small' ? 20 : 10);
    }
    
    setScore(scoreRef.current);
    
    // Slowly recover speed and depth if clearing board (and not currently trapped/resting)
    if (itemsRef.current.filter(i => i.type !== 'trap').length === 0 && now > trapEndTimeRef.current && now > restEndTimeRef.current) {
       speedRef.current = Math.max(20, speedRef.current - 5);
       depthRef.current = Math.max(30, depthRef.current - 5);
       setStrokeZone(handyKey, 100 - Math.round(depthRef.current), 100);
       setSpeed(handyKey, Math.round(speedRef.current));
    }
  };

  const renderItem = (item) => {
    switch (item.type) {
      case 'boobs':
        return <BoobsSVG className="w-16 h-16 drop-shadow-lg" />;
      case 'small':
        return <BoobsSVG className="w-8 h-8 drop-shadow-md" />;
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors text-gray-900 dark:text-white flex flex-col items-center p-6">
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <button onClick={() => navigate('/')} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">
          Game Mode
        </h1>
        <div className="flex gap-3">
          <button onClick={toggleTheme} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow hover:bg-gray-100 dark:hover:bg-gray-700">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={openSettings} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow hover:bg-gray-100 dark:hover:bg-gray-700">
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 flex flex-col items-center flex-grow">
        {gameState === 'idle' && (
          <div className="text-center my-auto">
            <h2 className="text-2xl font-bold mb-4">Are you ready?</h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Click the items as they fall to maintain control. If you miss them, the device gets deeper and faster!
            </p>
            <div className="text-sm text-left bg-gray-100 dark:bg-gray-700 p-4 rounded-xl mb-6 mx-auto max-w-md">
               <ul className="space-y-2">
                 <li className="flex items-center gap-2"><BoobsSVG className="w-6 h-6" /> <strong>Targets:</strong> Click them!</li>
                 <li className="flex items-center gap-2"><span className="text-lg">✂️</span> <strong>Splitters:</strong> Break into smaller targets.</li>
                 <li className="flex items-center gap-2"><span className="text-lg">💣</span> <strong>The Bomb (Rare):</strong> Clears screen, 5s rest!</li>
                 <li className="flex items-center gap-2"><span className="text-red-500 font-bold bg-red-100 px-2 rounded">!</span> <strong>The Trap:</strong> DO NOT CLICK! Causes a 3s max-intensity burst.</li>
               </ul>
            </div>
            
            <div className="mb-6 flex justify-center gap-4">
              <label className="flex items-center gap-2 font-semibold">
                Difficulty:
                <select 
                  className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-2 font-normal"
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
              className="bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold py-4 px-10 rounded-full shadow-lg hover:scale-105 transition-transform text-lg"
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
                 Speed: {performance.now() < trapEndTimeRef.current ? 100 : Math.round(speedRef.current)}% | 
                 Depth: {performance.now() < trapEndTimeRef.current ? 100 : Math.round(depthRef.current)}%
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
            <h2 className="text-4xl font-extrabold mb-4 text-red-500">Game Over</h2>
            <p className="text-2xl mb-8 text-gray-700 dark:text-gray-300">Final Score: <span className="font-bold">{score}</span></p>
            <button 
              onClick={startGame}
              className="bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold py-4 px-10 rounded-full shadow-lg hover:scale-105 transition-transform text-lg"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
