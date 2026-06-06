// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Bot, User } from 'lucide-react';
import { setSpeed, setStrokeLength } from '../services/handyService';

export default function ChatInterface({ settings }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey there... I've been waiting for you." }
  ]);
  const [input, setInput] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !settings.llmApiKey) {
        if (!settings.llmApiKey) alert("Please configure your LLM API Key in Settings.");
        return;
    }
    
    const userText = input;
    setInput('');
    
    const newMessages = [...messages, { role: 'user', text: userText }];
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
                                    
                                    if (type === 'SPEED') setSpeed(settings.handyKey, val);
                                    if (type === 'STROKE') setStrokeLength(settings.handyKey, val);
                                    
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
        
    } catch (err) {
        console.error("Chat Error:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 max-w-4xl mx-auto w-full shadow-lg">
      <div className="px-4 py-3 bg-white border-b flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chat Session</span>
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} className="rounded text-pink-500 focus:ring-pink-500" />
          <span className="text-gray-700 font-medium">Auto Mode</span>
        </label>
      </div>

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
            onMouseDown={() => setIsRecording(true)} onMouseUp={() => setIsRecording(false)} onMouseLeave={() => setIsRecording(false)}
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