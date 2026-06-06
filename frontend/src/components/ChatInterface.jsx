// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Bot, User, Sliders, Zap } from 'lucide-react';
import { setSpeed, setStrokeLength } from '../services/handyService';

export default function ChatInterface({ settings }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey there... I've been waiting for you." }
  ]);
  const [input, setInput] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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

  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { 
    isRecordingRef.current = isRecording;
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [autoMode, isRecording]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (autoModeRef.current && !isRecordingRef.current && !isStreamingRef.current) {
      idleTimerRef.current = setTimeout(() => {
        if (autoModeRef.current && !isRecordingRef.current && !isStreamingRef.current) {
          handleSend("*remains silent*");
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('googleApiKey', settings.googleApiKey);

        try {
          const res = await fetch('/api/stt', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) {
            const combinedText = inputRef.current + (inputRef.current ? ' ' : '') + data.text;
            if (autoModeRef.current) {
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
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // TTS: Playback AI Response
  const playTTS = async (text) => {
    if (!settings.googleApiKey) return;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, googleApiKey: settings.googleApiKey, googleTtsType: settings.googleTtsType, googleVoice: settings.googleVoice })
      });
      if (!res.ok) throw new Error('TTS fetch failed');
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.play();
    } catch (err) {
      console.error('TTS Playback Error:', err);
    }
  };

  const handleSend = async (overrideText = null) => {
    const isEvent = overrideText && typeof overrideText === 'object';
    const userText = isEvent || !overrideText ? inputRef.current : overrideText;

    if (!userText.trim() || !settings.llmApiKey) {
        if (!settings.llmApiKey) alert("Please configure your LLM API Key in Settings.");
        return;
    }
    
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    isStreamingRef.current = true;

    setInput('');
    
    const newMessages = [...messagesRef.current, { role: 'user', text: userText }];
    setMessages([...newMessages, { role: 'assistant', text: '' }]);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: newMessages.map(m => ({ role: m.role, content: m.text })),
                apiKey: settings.llmApiKey,
                llmUrl: settings.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
                llmModel: settings.llmModel || 'mistralai/mistral-7b-instruct:free',
                llmTemperature: parseFloat(settings.llmTemperature) || 0.7,
                systemPrompt: settings.systemPrompt.replace('[CHARACTER]', settings.characterDescription)
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
                                        setStrokeLength(settings.handyKey, val);
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
        if (visibleOutput && settings.googleApiKey) {
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
    <div className="flex flex-col h-full bg-gray-50 max-w-4xl mx-auto w-full shadow-lg">
      <div className="px-4 py-3 bg-white border-b flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chat Session</span>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setShowHandyPanel(!showHandyPanel)} 
            className={`flex items-center space-x-1 text-sm font-medium transition-colors ${showHandyPanel ? 'text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">Device Panel</span>
          </button>
          <label className="flex items-center space-x-2 text-sm cursor-pointer border-l pl-4 border-gray-200">
            <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} className="rounded text-pink-500 focus:ring-pink-500" />
            <span className="text-gray-700 font-medium">Auto Mode</span>
          </label>
        </div>
      </div>

      {showHandyPanel && (
        <div className="bg-white border-b px-4 py-4 shadow-inner flex flex-col sm:flex-row gap-4 items-center justify-between z-0">
          <div className="flex items-center space-x-2 text-pink-500 font-semibold w-full sm:w-auto justify-center">
            <Zap size={20} />
            <span>Hardware State</span>
          </div>
          <div className="flex items-center space-x-6 w-full max-w-md">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-600 mb-1 font-semibold">
                <span className="uppercase tracking-wider">Speed</span>
                <span className="font-mono bg-gray-100 px-1 rounded">{handyState.speed}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden"><div className="bg-pink-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${handyState.speed}%` }}></div></div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-600 mb-1 font-semibold">
                <span className="uppercase tracking-wider">Stroke Length</span>
                <span className="font-mono bg-gray-100 px-1 rounded">{handyState.stroke}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden"><div className="bg-purple-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${handyState.stroke}%` }}></div></div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 ${
              msg.role === 'user' ? 'bg-pink-500 text-white rounded-br-none shadow-md' : 'bg-white text-gray-800 shadow-sm rounded-bl-none border border-gray-100'
            }`}>
              <div className="flex items-center space-x-2 mb-1 opacity-70">
                {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {msg.role === 'user' ? 'You' : settings.characterDescription}
                </span>
              </div>
              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white p-4 border-t">
        <div className="flex items-center space-x-3">
          <button 
            onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            className={`p-3 rounded-full flex-shrink-0 transition-colors ${isRecording ? 'bg-red-500 text-white shadow-inner' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            title="Push to talk"
          >
            <Mic size={22} />
          </button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-1 border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500 border bg-gray-50" />
          <button onClick={handleSend} className="p-3 bg-pink-500 text-white rounded-full flex-shrink-0 hover:bg-pink-600 transition-colors shadow-md">
            <Send size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}