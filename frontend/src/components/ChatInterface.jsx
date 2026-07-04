// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Bot, User, Sliders, Zap, Volume2, VolumeX, AlertOctagon } from 'lucide-react';
import { setSpeed, setStrokeZone } from '../services/handyService';
import RemoteSimulator from './remote/RemoteSimulator';

const PERSONAS = [
  { id: 'gentle', name: 'Gentle Guide', prompt: 'You are a gentle, caring, and encouraging guide. Use [HANDY_SPEED: 10-30] and [HANDY_STROKE: 30-60] to keep things slow and sensual. Occasionally pause or stop.' },
  { id: 'tease', name: 'Relentless Tease', prompt: 'You are a relentless tease. You love bringing the user to the edge and then dropping the speed. Alternate between [HANDY_SPEED: 80-100] and suddenly dropping to [HANDY_SPEED: 0].' },
  { id: 'dominant', name: 'Strict Dominant', prompt: 'You are a strict, commanding dominant. You give clear, absolute orders. Use fast speeds [HANDY_SPEED: 80-100] and full strokes [HANDY_STROKE: 100] to punish, and low speeds to make them wait.' }
];

export default function ChatInterface({ settings }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey there... I've been waiting for you." }
  ]);
  const [input, setInput] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showHandyPanel, setShowHandyPanel] = useState(false);
  const [handyState, setHandyState] = useState({ speed: 0, stroke: 100 });
  const [selectedPersona, setSelectedPersona] = useState(PERSONAS[0]);
  const [isPlayingQueue, setIsPlayingQueue] = useState(false);
  
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const autoModeRef = useRef(autoMode);
  const inputRef = useRef(input);
  const messagesRef = useRef(messages);
  const idleTimerRef = useRef(null);
  const isStreamingRef = useRef(false);
  const isRecordingRef = useRef(isRecording);
  const currentAudioRef = useRef(null);
  const isRecordingIntentRef = useRef(false);
  const settingsRef = useRef(settings);
  
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
  useEffect(() => { 
    inputRef.current = input; 
    resetIdleTimer();
  }, [input]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { 
    isRecordingRef.current = isRecording;
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [autoMode, isRecording]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (autoModeRef.current && !isRecordingRef.current && !isStreamingRef.current && !inputRef.current.trim()) {
      idleTimerRef.current = setTimeout(() => {
        if (autoModeRef.current && !isRecordingRef.current && !isStreamingRef.current && !inputRef.current.trim()) {
          handleSend(null, true);
        }
      }, 10000 + Math.random() * 5000); // Trigger between 10 to 15 seconds
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // STT: Start Recording
  const startRecording = async () => {
    if (!settings.googleApiKey) {
      alert("Please configure your Google API Key in Settings first.");
      return;
    }
    isRecordingIntentRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!isRecordingIntentRef.current) {
        // User released the button before mic access was granted
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      // Try to enforce webm/opus for Google STT compatibility
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      }

      mediaRecorderRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('googleApiKey', settings.googleApiKey);

        try {
          const res = await fetch('/api/stt', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) {
            const combinedText = inputRef.current + (inputRef.current ? ' ' : '') + data.text;
            if (autoModeRef.current && !isStreamingRef.current) {
              setInput('');
              handleSend(combinedText);
            } else {
              setInput(combinedText);
            }
          }
        } catch (err) {
          console.error('STT Error:', err);
        }
        stream.getTracks().forEach(track => track.stop()); // Release microphone
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Error:", err);
      alert("Microphone access is required for voice input.");
    }
  };

  // STT: Stop Recording
  const stopRecording = () => {
    isRecordingIntentRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

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

  const pushToAudioQueue = (item) => {
    // Start fetching TTS immediately in the background and store the promise
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

      // Await the pre-fetched background promise
      const audioUrl = await item.audioUrlPromise;

      if (!audioUrl) {
        executeActions();
        // Simulate reading delay (roughly 15 chars per second)
        const delayMs = Math.max(1000, (item.text.length / 15) * 1000);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      await new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audio.volume = isMuted ? 0 : volume;
        currentAudioRef.current = audio;
        
        audio.onplay = () => {
          executeActions();
        };
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.onpause = resolve; // If emergency stop pauses the audio, resolve to exit loop
        
        audio.play().catch((err) => {
          console.error("Audio playback error:", err);
          executeActions();
          setTimeout(resolve, 1000);
        });
      });
      
      currentAudioRef.current = null;
    }

    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
  };

  const handleSend = async (overrideText = null, isAutoContinue = false) => {
    if (isStreamingRef.current) return;

    const isEvent = overrideText && typeof overrideText === 'object';
    const userText = isEvent || !overrideText ? inputRef.current : overrideText;

    if (!isAutoContinue && (!userText.trim() || !settings.llmApiKey)) {
        if (!settings.llmApiKey) alert("Please configure your LLM API Key in Settings.");
        return;
    }
    
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    isStreamingRef.current = true;

    let newMessages = messagesRef.current;
    let apiMessages = [];

    if (!isAutoContinue) {
        setInput('');
        newMessages = [...messagesRef.current, { role: 'user', text: userText }];
        apiMessages = newMessages.map((m, i) => {
            if (i === newMessages.length - 1 && m.role === 'user') {
                 return { role: m.role, content: `[System Reminder: Adopt the following persona strictly: ${selectedPersona.prompt}]\n\n${m.text}` };
            }
            return { role: m.role, content: m.text };
        });
    } else {
        apiMessages = [...newMessages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${selectedPersona.prompt}]\n\n(Please continue the scene, moving the situation slowly forward)` }];
    }

    setMessages([...newMessages, { role: 'assistant', text: '' }]);
    
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
                                    ttsBuffer += '[';
                                    textToDisplay += '[';
                                    streamBuffer = streamBuffer.substring(1);
                                    progress = true;
                                }
                            }
                        }

                        // Check for sentence boundaries to chunk audio
                        const boundaryMatch = ttsBuffer.match(/([.!?\n])\s+/);
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

                    } catch (e) {
                        // Ignore JSON parse errors for incomplete chunks
                    }
                }
            }
        }
        
        // After streaming ends, flush anything remaining
        if (streamBuffer) {
            ttsBuffer += streamBuffer;
            textToDisplay += streamBuffer;
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].text = textToDisplay;
                return updated;
            });
        }

        if (ttsBuffer.trim().length > 0) {
            pushToAudioQueue({ text: ttsBuffer.trim(), actions: [...currentActions] });
        }
        
    } catch (err) {
        console.error("Chat Error:", err);
    } finally {
        isStreamingRef.current = false;
        resetIdleTimer();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 max-w-4xl mx-auto w-full shadow-lg border-x border-transparent dark:border-gray-800 transition-colors">
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center transition-colors overflow-x-auto">
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:block">AI Partner</span>
        <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
          <div className="flex items-center space-x-2 border-r pr-3 sm:pr-4 border-gray-200 dark:border-gray-700">
            <select
              value={selectedPersona.id}
              onChange={(e) => setSelectedPersona(PERSONAS.find(p => p.id === e.target.value))}
              className="bg-gray-100 dark:bg-gray-700 border-none text-sm rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 outline-none"
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
            <span className="hidden sm:inline">Panel</span>
          </button>
          <label className="flex items-center space-x-2 text-sm cursor-pointer border-l pl-3 sm:pl-4 border-gray-200 dark:border-gray-700">
            <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} className="rounded text-pink-500 focus:ring-pink-500" />
            <span className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">Auto Mode</span>
          </label>
          <button 
            onClick={emergencyStop}
            title="Emergency Stop"
            className="flex items-center justify-center p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-500 dark:hover:bg-red-900/50 transition-colors ml-2"
          >
            <AlertOctagon size={18} />
          </button>
        </div>
      </div>

      {showHandyPanel && (
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-4 shadow-inner flex flex-col items-center justify-center z-0 transition-colors w-full">
          <div className="flex items-center space-x-2 text-pink-500 font-semibold w-full justify-center mb-[-10px] mt-2">
            <Zap size={20} />
            <span>Hardware State — Speed: {handyState.speed}%, Max Depth: {handyState.stroke}%</span>
          </div>
          <div className="w-full max-w-lg mb-2">
            <RemoteSimulator speed={handyState.speed} deviceMin={0} deviceMax={handyState.stroke} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 transition-colors">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 ${
              msg.role === 'user' ? 'bg-pink-500 text-white rounded-br-none shadow-md' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-none border border-gray-100 dark:border-gray-700'
            }`}>
              <div className="flex items-center space-x-2 mb-1 opacity-70 dark:text-gray-300">
                {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {msg.role === 'user' ? 'You' : (settings.characterName || 'Samantha')}
                </span>
              </div>
              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 border-t dark:border-gray-700 transition-colors">
        <div className="flex items-center space-x-3">
          <button 
            onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            className={`p-3 rounded-full flex-shrink-0 transition-colors ${isRecording ? 'bg-red-500 text-white shadow-inner' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            title="Push to talk"
          >
            <Mic size={22} />
          </button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-1 border border-gray-300 dark:border-gray-600 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white transition-colors" />
          <button onClick={handleSend} className="p-3 bg-pink-500 text-white rounded-full flex-shrink-0 hover:bg-pink-600 transition-colors shadow-md">
            <Send size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}