import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import { setSpeed, setStrokeZone, stopHamp } from '../../services/handyService';

export default function GameMode({ isDarkMode, toggleTheme, settings, openSettings }) {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState('idle'); // idle, playing, gameover
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  
  const [items, setItems] = useState([]);
  
  // Game state refs for the loop
  const itemsRef = useRef([]);
  const speedRef = useRef(20);
  const depthRef = useRef(30);
  const scoreRef = useRef(0);
  
  // Settings
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
    
    // Reset state
    setScore(0);
    setItems([]);
    itemsRef.current = [];
    speedRef.current = 20;
    depthRef.current = 30;
    scoreRef.current = 0;
    
    // Initial Handy Command
    setStrokeZone(handyKey, 100 - depthRef.current, 100);
    setSpeed(handyKey, speedRef.current);
    
    setGameState('playing');
  };
  
  const stopGame = () => {
    setGameState('gameover');
    stopHamp(handyKey);
  };

  // Main Game Loop using useEffect
  useEffect(() => {
    if (gameState !== 'playing') return;

    let animationFrameId;
    let lastTime = performance.now();
    let lastPenaltyTime = performance.now();

    const loop = (time) => {
      // Prevent huge jumps if tab is inactive
      const deltaTime = Math.min(time - lastTime, 50);
      lastTime = time;
      
      const diffMult = difficultyMultiplier[difficulty] || 2;

      // Spawn new item (approx 2-4 items per second)
      if (Math.random() < 0.02 * diffMult) {
        itemsRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: 5 + Math.random() * 90, // % left (keep away from edges)
          y: -10, // % top (start slightly above)
          speed: 10 + Math.random() * 15 * diffMult // % per second
        });
      }
      
      // Update positions
      let missedCount = 0;
      itemsRef.current = itemsRef.current.map(item => {
        const newY = item.y + (item.speed * (deltaTime / 1000));
        // Give it a buffer below 100 before counting as missed
        if (newY > 110) missedCount++;
        return { ...item, y: newY };
      }).filter(item => item.y <= 110);
      
      // Penalty Logic
      if (missedCount > 0 || itemsRef.current.length > 5) {
        // Throttle API calls to max once per second to prevent rate limiting
        if (time - lastPenaltyTime > 1000) {
          const penalty = missedCount * 2 + (itemsRef.current.length > 5 ? 2 : 0);
          speedRef.current = Math.min(100, speedRef.current + penalty * diffMult);
          depthRef.current = Math.min(100, depthRef.current + penalty * diffMult);
          
          setStrokeZone(handyKey, 100 - Math.round(depthRef.current), 100);
          setSpeed(handyKey, Math.round(speedRef.current));
          
          lastPenaltyTime = time;
        }
      }
      
      // Trigger re-render with new items
      setItems([...itemsRef.current]);
      
      // Check lose condition
      if (itemsRef.current.length > 20) {
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

  const handleItemClick = (id) => {
    if (gameState !== 'playing') return;
    itemsRef.current = itemsRef.current.filter(i => i.id !== id);
    scoreRef.current += 10;
    setScore(scoreRef.current);
    
    // Slowly recover speed and depth if doing well
    if (itemsRef.current.length === 0) {
       speedRef.current = Math.max(20, speedRef.current - 5);
       depthRef.current = Math.max(30, depthRef.current - 5);
       setStrokeZone(handyKey, 100 - Math.round(depthRef.current), 100);
       setSpeed(handyKey, Math.round(speedRef.current));
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
            <p className="mb-6 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Click the items as they fall. If you miss them or let them build up, the device gets deeper and faster!
            </p>
            <div className="mb-6 flex justify-center gap-4">
              <label className="flex items-center gap-2 font-semibold">
                Difficulty:
                <select 
                  className="bg-gray-100 dark:bg-gray-700 rounded-lg p-2 font-normal"
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
            <div className="w-full flex justify-between mb-4 px-4 font-bold text-xl">
              <span className="text-blue-500">Score: {score}</span>
              <span className="text-red-500">Speed: {Math.round(speedRef.current)}% | Depth: {Math.round(depthRef.current)}%</span>
            </div>
            
            <div className="relative w-full max-w-2xl flex-grow min-h-[500px] bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-inner select-none cursor-crosshair">
              {items.map(item => (
                <div 
                  key={item.id}
                  onPointerDown={() => handleItemClick(item.id)}
                  className="absolute w-12 h-12 bg-red-500 rounded-full cursor-pointer hover:bg-red-400 active:scale-90 transition-all shadow-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ left: `${item.x}%`, top: `${item.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  Click
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
