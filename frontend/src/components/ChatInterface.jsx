// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Bot, User, Sliders, Zap, Volume2, VolumeX } from 'lucide-react';
import { setSpeed, setStrokeZone } from '../services/handyService';

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

  // TTS: Playback AI Response
  const playTTS = async (text) => {
    if (isMuted) return;
    if (settings.ttsProvider !== 'Kokoro' && !settings.googleApiKey) return;
    
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          ttsProvider: settings.ttsProvider,
          googleApiKey: settings.googleApiKey, 
          googleTtsType: settings.googleTtsType, 
          googleVoice: settings.googleVoice,
          kokoroUrl: settings.kokoroUrl,
          kokoroVoice: settings.kokoroVoice
        })
      });
      if (!res.ok) throw new Error('TTS fetch failed');
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.volume = volume;
      currentAudioRef.current = audio;
      audio.play();
      audio.onended = () => {
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };
    } catch (err) {
      console.error('TTS Playback Error:', err);
    }
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
        apiMessages = newMessages.map(m => ({ role: m.role, content: m.text }));
    } else {
        apiMessages = [...newMessages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: '(Please continue the scene, moving the situation slowly forward)' }];
    }

    setMessages([...newMessages, { role: 'assistant', text: '' }]);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: apiMessages,
                apiKey: settings.llmApiKey,
                llmUrl: settings.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
                llmModel: settings.llmModel || 'mistralai/mistral-7b-instruct:free',
                llmTemperature: parseFloat(settings.llmTemperature) || 0.7,
                systemPrompt: settings.systemPrompt.replace(/\[CHARACTER\]/g, settings.characterDescription).replace(/\[NAME\]/g, settings.characterName || 'Samantha')
            })
        });

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let streamBuffer = '';
        let visibleOutput = '';

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
                                visibleOutput += streamBuffer;
                                streamBuffer = '';
                                break;
                            }
                            
                            if (bracketIndex > 0) {
                                visibleOutput += streamBuffer.substring(0, bracketIndex);
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
                                    
                                    if (type === 'SPEED') {
                                        setSpeed(settings.handyKey, val);
                                        setHandyState(prev => ({ ...prev, speed: val }));
                                    }
                                    if (type === 'STROKE') {
                                        setStrokeZone(settings.handyKey, 0, val);
                                        setHandyState(prev => ({ ...prev, stroke: val }));
                                    }
                                    
                                    streamBuffer = streamBuffer.substring(closeBracketIndex + 1);
                                    progress = true;
                                } else {
                                    visibleOutput += '[';
                                    streamBuffer = streamBuffer.substring(1);
                                    progress = true;
                                }
                            }
                        }

                        let textToDisplay = visibleOutput;
                        if (!streamBuffer.startsWith('[HANDY_') && !'[HANDY_'.startsWith(streamBuffer)) {
                            textToDisplay += streamBuffer;
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
            visibleOutput += streamBuffer;
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].text = visibleOutput;
                return updated;
            });
        }

        // Play the generated text via TTS when done
        const canPlayTTS = settings.ttsProvider === 'Kokoro' ? !!settings.kokoroUrl : !!settings.googleApiKey;
        if (visibleOutput && canPlayTTS) {
            playTTS(visibleOutput);
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
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:block">Chat Session</span>
        <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
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
        </div>
      </div>

      {showHandyPanel && (
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-4 shadow-inner flex flex-col sm:flex-row gap-4 items-center justify-between z-0 transition-colors">
          <div className="flex items-center space-x-2 text-pink-500 font-semibold w-full sm:w-auto justify-center">
            <Zap size={20} />
            <span>Hardware State</span>
          </div>
          <div className="flex items-center space-x-6 w-full max-w-md">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
                <span className="uppercase tracking-wider">Speed</span>
                <span className="font-mono bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1 rounded">{handyState.speed}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden"><div className="bg-pink-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${handyState.speed}%` }}></div></div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
                <span className="uppercase tracking-wider">Stroke Length</span>
                <span className="font-mono bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1 rounded">{handyState.stroke}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden"><div className="bg-purple-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${handyState.stroke}%` }}></div></div>
            </div>
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