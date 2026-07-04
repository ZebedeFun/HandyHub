// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Bot, Sliders, Zap, Volume2, VolumeX, AlertOctagon, Flame, CheckCircle } from 'lucide-react';
import { setSpeed, setStrokeZone } from '../services/handyService';
import RemoteSimulator from './remote/RemoteSimulator';

const PERSONAS = [
  { id: 'gentle', name: 'Gentle Guide', prompt: 'You are a gentle, caring, and encouraging guide. Use [HANDY_SPEED: 10-30] and [HANDY_STROKE: 30-60] to keep things slow and sensual. Occasionally pause or stop.' },
  { id: 'tease', name: 'Relentless Tease', prompt: 'You are a relentless tease. You love bringing the user to the edge and then dropping the speed. Alternate between [HANDY_SPEED: 80-100] and suddenly dropping to [HANDY_SPEED: 0].' },
  { id: 'dominant', name: 'Strict Dominant', prompt: 'You are a strict, commanding dominant. You give clear, absolute orders. Use fast speeds [HANDY_SPEED: 80-100] and full strokes [HANDY_STROKE: 100] to punish, and low speeds to make them wait.' }
];

export default function ChatInterface({ settings }) {
  const [messages, setMessages] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showHandyPanel, setShowHandyPanel] = useState(false);
  const [handyState, setHandyState] = useState({ speed: 0, stroke: 100 });
  const [selectedPersona, setSelectedPersona] = useState(PERSONAS[0]);
  const [isPlayingQueue, setIsPlayingQueue] = useState(false);
  const [finishState, setFinishState] = useState('idle');
  
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(false);
  const currentAudioRef = useRef(null);
  const settingsRef = useRef(settings);
  const isActiveRef = useRef(isActive);
  const loopTimerRef = useRef(null);
  
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);

  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    return () => { if (loopTimerRef.current) clearTimeout(loopTimerRef.current); };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Audio Queue System
  const fetchTTSAudio = async (text) => {
    const s = settingsRef.current;
    if (s.ttsProvider !== 'Kokoro' && !s.googleApiKey) return null;
    
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          ttsProvider: s.ttsProvider,
          googleApiKey: s.googleApiKey, 
          googleTtsType: s.googleTtsType, 
          googleVoice: s.googleVoice,
          kokoroUrl: s.kokoroUrl,
          kokoroVoice: s.kokoroVoice
        })
      });
      if (!res.ok) throw new Error('TTS fetch failed');
      return URL.createObjectURL(await res.blob());
    } catch (err) {
      console.error('TTS Fetch Error:', err);
      return null;
    }
  };

  const emergencyStop = () => {
    setIsActive(false);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    
    // 1. Clear queue
    audioQueueRef.current = [];
    
    // 2. Stop processing flags
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    
    // 3. Stop current audio if playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    
    // 4. Send stop command to device
    const s = settingsRef.current;
    if (s && s.handyKey) {
      setSpeed(s.handyKey, 0);
      setHandyState(prev => ({ ...prev, speed: 0 }));
    }
  };

  const handleFinishClick = () => {
    const s = settingsRef.current;
    
    // Stop current audio and clear queue
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    
    // Interrupt streaming if active
    if (isStreamingRef.current) {
        // We can't strictly abort the fetch without an AbortController, but we can set a flag.
        // For now, setting isStreamingRef to false will allow generateNextScene to run again.
        isStreamingRef.current = false; 
    }

    if (finishState === 'idle') {
      if (s && s.handyKey) {
        setSpeed(s.handyKey, 80);
        setStrokeZone(s.handyKey, 0, 100);
      }
      setHandyState({ speed: 80, stroke: 100 });
      setFinishState('finishing');
      generateNextScene(false, "(The user is climaxing right now. Talk to them and encourage their orgasm!)");
    } else {
      if (s && s.handyKey) {
        setSpeed(s.handyKey, 20);
        setStrokeZone(s.handyKey, 0, 40);
      }
      setHandyState({ speed: 20, stroke: 40 });
      setFinishState('idle');
      generateNextScene(false, "(The user has just finished. Talk to them about it, praise them, and offer post-orgasm care or teasing depending on your persona.)");
    }
  };

  const pushToAudioQueue = (item) => {
    const audioUrlPromise = fetchTTSAudio(item.text);
    audioQueueRef.current.push({ ...item, audioUrlPromise });
    processAudioQueue();
  };

  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    setIsPlayingQueue(true);

    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift();
      const s = settingsRef.current;
      
      const executeActions = () => {
        for (const action of item.actions) {
          if (action.type === 'SPEED') {
            setSpeed(s.handyKey, action.val);
            setHandyState(prev => ({ ...prev, speed: action.val }));
          } else if (action.type === 'STROKE') {
            setStrokeZone(s.handyKey, 0, action.val);
            setHandyState(prev => ({ ...prev, stroke: action.val }));
          }
        }
      };

      const audioUrl = item.audioUrlPromise ? await item.audioUrlPromise : null;

      if (item.isSceneDelay) {
        await new Promise(r => setTimeout(r, item.delayMs));
        if (isActiveRef.current && !isStreamingRef.current && audioQueueRef.current.length < 2) {
            generateNextScene();
        }
        continue;
      }

      if (!audioUrl) {
        executeActions();
        const delayMs = Math.max(1000, ((item.text || '').length / 15) * 1000);
        await new Promise(r => setTimeout(r, delayMs));
        if (isActiveRef.current && !isStreamingRef.current && audioQueueRef.current.length < 2) {
            generateNextScene();
        }
        continue;
      }

      await new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audio.volume = isMutedRef.current ? 0 : volumeRef.current;
        currentAudioRef.current = audio;
        
        audio.onplay = () => {
          executeActions();
        };
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.onpause = resolve; 
        
        audio.play().catch((err) => {
          console.error("Audio playback error:", err);
          executeActions();
          setTimeout(resolve, 1000);
        });
      });
      
      currentAudioRef.current = null;
      
      if (isActiveRef.current && !isStreamingRef.current && audioQueueRef.current.length < 2) {
          generateNextScene();
      }
    }

    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    
    if (isActiveRef.current && !isStreamingRef.current) {
        generateNextScene();
    }
  };

  const startExperience = () => {
      if (!settings.llmApiKey) {
          alert("Please configure your LLM API Key in Settings.");
          return;
      }
      setIsActive(true);
      isActiveRef.current = true; // Update ref synchronously so generateNextScene doesn't abort
      if (messages.length === 0) {
          generateNextScene(true);
      } else {
          generateNextScene();
      }
  };

  const generateNextScene = async (isFirst = false, overridePrompt = null) => {
    if (isStreamingRef.current || !isActiveRef.current) return;
    
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    isStreamingRef.current = true;

    if (!isFirst && !overridePrompt) {
        const delay = (settingsRef.current.sceneDelay || 2.5) * 1000;
        audioQueueRef.current.push({ text: "", isSceneDelay: true, delayMs: delay, actions: [] });
        processAudioQueue();
    }

    let apiMessages = [];

    if (overridePrompt) {
        apiMessages = [...messagesRef.current.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${selectedPersona.prompt}]\n\n${overridePrompt}` }];
    } else if (isFirst) {
        apiMessages = [
            { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${selectedPersona.prompt}]\n\n(Please start the scene and begin playing with me)` }
        ];
    } else {
        apiMessages = [...messagesRef.current.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${selectedPersona.prompt}]\n\n(Please continue the scene, moving the situation slowly forward)` }];
    }

    setMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    
    try {
        const basePrompt = settings.systemPrompt.replace(/\[CHARACTER\]/g, settings.characterDescription).replace(/\[NAME\]/g, settings.characterName || 'Samantha');
        const placementInstruction = "CRITICAL: You must place any [HANDY_...] tags AT THE VERY START of the sentence they apply to, or inline just before the action word. NEVER put tags at the end of a sentence.\nExample: '[HANDY_SPEED:80] Let's go much faster.'";
        const finalSystemPrompt = `IMPORTANT CURRENT MOOD / ROLE: ${selectedPersona.prompt}\n\n${basePrompt}\n\n${placementInstruction}`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: apiMessages,
                apiKey: settings.llmApiKey,
                llmUrl: settings.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
                llmModel: settings.llmModel || 'mistralai/mistral-7b-instruct:free',
                llmTemperature: parseFloat(settings.llmTemperature) || 0.7,
                systemPrompt: finalSystemPrompt
            })
        });

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let streamBuffer = '';
        let ttsBuffer = '';
        let textToDisplay = '';
        let currentActions = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!isActiveRef.current) {
                // If user stopped, abort processing
                reader.cancel();
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        const delta = parsed.choices[0]?.delta?.content || '';
                        streamBuffer += delta;

                        let progress = true;
                        while (progress) {
                            progress = false;
                            
                            const bracketIndex = streamBuffer.indexOf('[');
                            if (bracketIndex === -1) {
                                ttsBuffer += streamBuffer;
                                textToDisplay += streamBuffer;
                                streamBuffer = '';
                                break;
                            }
                            
                            if (bracketIndex > 0) {
                                const textBeforeTag = streamBuffer.substring(0, bracketIndex);
                                ttsBuffer += textBeforeTag;
                                textToDisplay += textBeforeTag;
                                streamBuffer = streamBuffer.substring(bracketIndex);
                                progress = true;
                                continue;
                            }
                            
                            const closeBracketIndex = streamBuffer.indexOf(']');
                            if (closeBracketIndex !== -1) {
                                const potentialTag = streamBuffer.substring(0, closeBracketIndex + 1);
                                const match = /^\[HANDY_(SPEED|STROKE):\s*(\d+)\s*\]$/.exec(potentialTag);
                                
                                if (match) {
                                    const type = match[1];
                                    const val = parseInt(match[2], 10);
                                    currentActions.push({ type, val });
                                    
                                    streamBuffer = streamBuffer.substring(closeBracketIndex + 1);
                                    progress = true;
                                } else {
                                    // Swallow unrecognized bracket tags
                                    streamBuffer = streamBuffer.substring(closeBracketIndex + 1);
                                    progress = true;
                                }
                            }
                        }

                        const boundaryMatch = ttsBuffer.match(/([.!?,\n;])\s+/);
                        if (boundaryMatch) {
                          const boundaryIndex = boundaryMatch.index + boundaryMatch[1].length;
                          const sentence = ttsBuffer.substring(0, boundaryIndex).trim();
                          ttsBuffer = ttsBuffer.substring(boundaryIndex).trimStart();
                          
                          if (sentence.length > 0) {
                            pushToAudioQueue({ text: sentence, actions: [...currentActions] });
                            currentActions = [];
                          }
                        }

                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1].text = textToDisplay;
                            return updated;
                        });

                    } catch (e) {}
                }
            }
        }
        
        if (isActiveRef.current && streamBuffer) {
            ttsBuffer += streamBuffer;
            textToDisplay += streamBuffer;
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].text = textToDisplay;
                return updated;
            });
        }

        if (isActiveRef.current && ttsBuffer.trim().length > 0) {
            pushToAudioQueue({ text: ttsBuffer.trim(), actions: [...currentActions] });
        }
        
    } catch (err) {
        console.error("Chat Error:", err);
    } finally {
        isStreamingRef.current = false;
        if (isActiveRef.current && audioQueueRef.current.length < 2) {
            generateNextScene();
        }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 max-w-4xl mx-auto w-full shadow-lg border-x border-transparent dark:border-gray-800 transition-colors relative">
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center transition-colors overflow-x-auto relative z-10">
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:block">Passive Experience</span>
        <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
          <div className="flex items-center space-x-2 border-r pr-3 sm:pr-4 border-gray-200 dark:border-gray-700">
            <select
              value={selectedPersona.id}
              onChange={(e) => setSelectedPersona(PERSONAS.find(p => p.id === e.target.value))}
              disabled={isActive}
              className="bg-gray-100 dark:bg-gray-700 border-none text-sm rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 outline-none disabled:opacity-50"
            >
              {PERSONAS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="text-gray-500 dark:text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input 
              type="range" 
              min="0" max="1" step="0.05" 
              value={isMuted ? 0 : volume} 
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                if (val > 0) setIsMuted(false);
                if (val === 0) setIsMuted(true);
              }}
              className="w-16 sm:w-20 accent-pink-500"
            />
          </div>
          <button 
            onClick={() => setShowHandyPanel(!showHandyPanel)} 
            className={`flex items-center space-x-1 text-sm font-medium transition-colors border-l pl-3 sm:pl-4 border-gray-200 dark:border-gray-700 ${showHandyPanel ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">Test Mode</span>
          </button>
        </div>
      </div>

      {showHandyPanel && (
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-2 shadow-inner flex flex-col items-center justify-center z-0 transition-colors w-full">
          <div className="flex items-center space-x-2 text-pink-500 font-semibold w-full justify-center mb-1">
            <Zap size={16} />
            <span className="text-sm">Hardware State — Speed: {handyState.speed}%, Max Depth: {handyState.stroke}%</span>
          </div>
          <div className="w-full max-w-lg">
            <RemoteSimulator speed={handyState.speed} deviceMin={0} deviceMax={handyState.stroke} />
          </div>
        </div>
      )}

      {/* Cinematic View */}
      <div className="flex-1 overflow-y-hidden relative flex flex-col justify-end p-8 pb-32 bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="flex flex-col space-y-6 w-full max-w-3xl mx-auto">
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            // The further back the message, the smaller and more faded it gets.
            const distance = messages.length - 1 - idx;
            const opacity = isLast ? 'opacity-100' : distance === 1 ? 'opacity-60' : distance === 2 ? 'opacity-30' : 'opacity-0 hidden';
            const scale = isLast ? 'scale-100' : distance === 1 ? 'scale-95 -translate-y-4' : distance === 2 ? 'scale-90 -translate-y-8' : 'scale-75';

            return (
              <div 
                key={idx} 
                className={`text-center transition-all duration-700 ease-in-out transform origin-bottom ${opacity} ${scale}`}
              >
                {isLast && (
                    <div className="flex items-center justify-center space-x-2 mb-3 text-pink-500 dark:text-pink-400">
                        <Bot size={20} />
                        <span className="text-sm font-bold uppercase tracking-widest">
                            {settings.characterName || 'Samantha'}
                        </span>
                    </div>
                )}
                <p className={`leading-relaxed whitespace-pre-wrap mx-auto font-medium ${isLast ? 'text-2xl md:text-3xl lg:text-4xl text-gray-800 dark:text-white' : 'text-xl md:text-2xl text-gray-500 dark:text-gray-400'}`}>
                  {msg.text || (isStreamingRef.current && isLast ? <span className="animate-pulse">...</span> : "")}
                </p>
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent dark:from-gray-900 dark:via-gray-900 pb-8 pt-24 px-4 flex justify-center z-10 pointer-events-none">
          <div className="pointer-events-auto flex items-center space-x-4 bg-white dark:bg-gray-800 p-2 rounded-full shadow-2xl border dark:border-gray-700">
            {!isActive ? (
                <button 
                  onClick={startExperience} 
                  className="flex items-center justify-center space-x-2 bg-pink-500 hover:bg-pink-600 text-white px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
                >
                  <Play size={24} fill="currentColor" />
                  <span>START EXPERIENCE</span>
                </button>
            ) : (
                <>
                    <button 
                      onClick={emergencyStop} 
                      className="flex items-center justify-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
                    >
                      <Square size={24} fill="currentColor" />
                      <span>STOP</span>
                    </button>
                    <button 
                      onClick={handleFinishClick} 
                      className={`flex items-center justify-center space-x-2 text-white px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg ${finishState === 'idle' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-500 hover:bg-purple-600'}`}
                    >
                      {finishState === 'idle' ? <Flame size={24} fill="currentColor" /> : <CheckCircle size={24} fill="currentColor" />}
                      <span>{finishState === 'idle' ? 'Finish!' : 'and Done!'}</span>
                    </button>
                    <button 
                        onClick={emergencyStop}
                        title="Emergency Stop"
                        className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-500 dark:hover:bg-red-900/50 transition-colors"
                    >
                        <AlertOctagon size={24} />
                    </button>
                </>
            )}
          </div>
      </div>
    </div>
  );
}