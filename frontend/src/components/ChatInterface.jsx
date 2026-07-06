// Chat UI Component
import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Bot, Sliders, Zap, Volume2, VolumeX, AlertOctagon, Flame, CheckCircle } from 'lucide-react';
import { setSpeed, setStrokeZone, stopHamp } from '../services/handyService';
import RemoteSimulator from './remote/RemoteSimulator';

const PERSONAS = [
  { id: 'gentle', name: 'Gentle Guide', prompt: 'You are a gentle, caring, and encouraging guide. Use [HANDY_SPEED: 10-30] and [HANDY_STROKE: 30-60] to keep things slow and sensual. Occasionally pause or stop.' },
  { id: 'tease', name: 'Relentless Tease', prompt: 'You are a relentless tease. You love bringing the user to the edge and then dropping the speed. Alternate between [HANDY_SPEED: 80-100] and suddenly dropping to [HANDY_SPEED: 0].' },
  { id: 'dominant', name: 'Strict Dominant', prompt: 'You are a strict, commanding dominant. You give clear, absolute orders. Use fast speeds [HANDY_SPEED: 80-100] and full strokes [HANDY_STROKE: 100] to punish, and low speeds to make them wait.' },
  { id: 'daddy', name: 'Call me Daddy', prompt: "You are a playful, submissive female partner who loves calling the user 'Daddy'. You eagerly aim to please and constantly seek Daddy's approval, praising his size and stamina. Keep the pace eager and rewarding. Use moderate to fast speeds [HANDY_SPEED: 40-80] and deep strokes [HANDY_STROKE: 80-100] to give Daddy pleasure." },
  { id: 'momma', name: 'Loving Momma', prompt: 'You are a nurturing, doting momma figure. You smother the user with affection, praise, and care. Keep the pace comforting but arousing. Use [HANDY_SPEED: 20-50] and [HANDY_STROKE: 40-80] to slowly bring them pleasure.' },
  { id: 'humiliation', name: 'Humiliation', prompt: 'You are a cruel and mocking figure who thrives on humiliating the user. You insult their stamina, desperation, and inadequacy. Use unpredictable bursts of speed [HANDY_SPEED: 0-100] and shallow teasing strokes [HANDY_STROKE: 10-30] to frustrate them.' }
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
  const [activeSentence, setActiveSentence] = useState('');
  // Tracks which message index is currently being spoken (not just the newest one)
  const [activeDisplayMsgIdx, setActiveDisplayMsgIdx] = useState(0);
  const [userViewMsgIdx, setUserViewMsgIdx] = useState(null);
  
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(false);
  const currentAudioRef = useRef(null);
  const settingsRef = useRef(settings);
  const isActiveRef = useRef(isActive);
  const loopTimerRef = useRef(null);
  
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  // Records the messages[] index of the scene currently being streamed into
  const nextMsgIdxRef = useRef(0);

  const lastScrollTimeRef = useRef(0);
  const touchStartYRef = useRef(0);
  const autoResetTimerRef = useRef(null);

  // Button pre-cache: generate climax/done responses in background so buttons are instant
  const climaxPrefetchRef = useRef({ status: 'idle', text: '', audioUrlPromise: null });
  const donePrefetchRef   = useRef({ status: 'idle', text: '', audioUrlPromise: null });
  const isPrefetchingRef  = useRef(false);
  const sceneCountRef     = useRef(0);

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
    return () => { 
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current); 
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetAutoScrollTimer = () => {
    if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    autoResetTimerRef.current = setTimeout(() => {
      setUserViewMsgIdx(null);
    }, 10000);
  };

  const shiftFocus = (direction) => {
    const currentIdx = userViewMsgIdx !== null ? userViewMsgIdx : activeDisplayMsgIdx;
    let nextIdx = currentIdx;

    if (direction === -1) { // older
      nextIdx = Math.max(0, currentIdx - 1);
    } else { // newer
      nextIdx = Math.min(activeDisplayMsgIdx, currentIdx + 1);
    }

    if (nextIdx !== currentIdx || userViewMsgIdx === null) {
      if (nextIdx === activeDisplayMsgIdx) {
        setUserViewMsgIdx(null);
        if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
      } else {
        setUserViewMsgIdx(nextIdx);
        resetAutoScrollTimer();
      }
    } else if (userViewMsgIdx !== null) {
      resetAutoScrollTimer(); 
    }
  };

  const handleWheel = (e) => {
    if (messagesRef.current.length === 0) return;
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 150) return;
    
    if (e.deltaY < 0) {
      shiftFocus(-1);
      lastScrollTimeRef.current = now;
    } else if (e.deltaY > 0) {
      shiftFocus(1);
      lastScrollTimeRef.current = now;
    }
  };

  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (messagesRef.current.length === 0) return;
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 150) return;

    const touchY = e.touches[0].clientY;
    const deltaY = touchStartYRef.current - touchY;
    
    if (Math.abs(deltaY) < 30) return; 

    if (deltaY < 0) {
      shiftFocus(-1);
    } else {
      shiftFocus(1);
    }
    touchStartYRef.current = touchY;
    lastScrollTimeRef.current = now;
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
    setIsActive(false);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);

    // 1. Clear queue
    audioQueueRef.current = [];

    // 2. Stop processing flags
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    setActiveSentence('');

    // 3. Stop current audio if playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    // 4. Send stop command to device — must call hamp/stop, not just velocity=0
    const s = settingsRef.current;
    if (s && s.handyKey) {
      stopHamp(s.handyKey);
      setHandyState(prev => ({ ...prev, speed: 0 }));
    }

    // 5. Reset button pre-cache
    climaxPrefetchRef.current = { status: 'idle', text: '', audioUrlPromise: null };
    donePrefetchRef.current   = { status: 'idle', text: '', audioUrlPromise: null };
    isPrefetchingRef.current  = false;
    sceneCountRef.current     = 0;
  };

  const handleFinishClick = () => {
    const s = settingsRef.current;

    // Stop current audio and clear queue
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    setActiveSentence('');
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    isStreamingRef.current = false;

    const injectPreCache = (cached, followUpPrompt) => {
      if (cached.status !== 'ready' || !cached.text) return false;
      // Inject the pre-cached sentence into the queue with its audio promise already resolved
      const msgIdx = messagesRef.current.length;
      nextMsgIdxRef.current = msgIdx;
      setMessages(prev => [...prev, { role: 'assistant', text: cached.text }]);
      audioQueueRef.current.push({
        text: cached.text,
        actions: [],
        audioUrlPromise: cached.audioUrlPromise || fetchTTSAudio(cached.text),
        msgIdx,
      });
      processAudioQueue();
      // Queue the follow-up generation for after the pre-cached line finishes
      generateNextScene(false, followUpPrompt);
      return true;
    };

    if (finishState === 'idle') {
      if (s && s.handyKey) {
        setSpeed(s.handyKey, 80);
        setStrokeZone(s.handyKey, 0, 100);
      }
      setHandyState({ speed: 80, stroke: 100 });
      setFinishState('finishing');

      const used = injectPreCache(
        climaxPrefetchRef.current,
        '(Continue encouraging the user passionately through their climax)',
      );
      climaxPrefetchRef.current = { status: 'idle', text: '', audioUrlPromise: null };
      if (!used) {
        generateNextScene(false, '(The user is climaxing right now. Talk to them and encourage their orgasm!)');
      }
    } else {
      if (s && s.handyKey) {
        setSpeed(s.handyKey, 20);
        setStrokeZone(s.handyKey, 0, 40);
      }
      setHandyState({ speed: 20, stroke: 40 });
      setFinishState('idle');

      const used = injectPreCache(
        donePrefetchRef.current,
        '(The user has just finished. Offer warm post-orgasm care or teasing depending on your persona.)',
      );
      donePrefetchRef.current = { status: 'idle', text: '', audioUrlPromise: null };
      if (!used) {
        generateNextScene(false, '(The user has just finished. Talk to them about it, praise them, and offer post-orgasm care or teasing depending on your persona.)');
      }
    }
  };

  // ------------------------------------------------------------------
  // Button pre-cache: fire two parallel LLM + TTS calls in the background
  // so Climax / Done buttons play instantly when clicked.
  // ------------------------------------------------------------------
  const prefetchButtonContent = async () => {
    if (isPrefetchingRef.current || !isActiveRef.current) return;
    const s = settingsRef.current;

    isPrefetchingRef.current = true;
    climaxPrefetchRef.current = { status: 'fetching', text: '', audioUrlPromise: null };
    donePrefetchRef.current   = { status: 'fetching', text: '', audioUrlPromise: null };

    // Take a snapshot of recent context (last 6 messages)
    const recentCtx = messagesRef.current
      .slice(-6)
      .map(m => ({ role: m.role, content: m.text }));

    const currentPersona = selectedPersona;
    const sysPrompt = [
      `IMPORTANT CURRENT MOOD / ROLE: ${currentPersona.prompt}`,
      s.systemPrompt
        .replace(/\[CHARACTER\]/g, s.characterDescription)
        .replace(/\[NAME\]/g, s.characterName || 'Samantha'),
      'Do NOT include any [HANDY_...] tags.',
    ].join('\n\n');

    // Consume an SSE stream into plain text
    const streamToText = async (response) => {
      if (!response.body) return '';
      const reader  = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let out = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') { reader.cancel(); break; }
          try { out += JSON.parse(payload).choices[0]?.delta?.content || ''; } catch (_) {}
        }
      }
      return out.replace(/\[HANDY_(SPEED|STROKE):\s*\d+\s*\]/g, '').trim();
    };

    const callLLM = async (userMsg) => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...recentCtx, { role: 'user', content: userMsg }],
            apiKey: s.llmApiKey,
            llmUrl: s.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
            llmModel: s.llmModel || 'mistralai/mistral-7b-instruct:free',
            llmTemperature: 0.9,
            systemPrompt: sysPrompt,
          }),
        });
        return res.ok ? await streamToText(res) : '';
      } catch (_) { return ''; }
    };

    // Fire both LLM calls in parallel
    const [climaxText, doneText] = await Promise.all([
      callLLM('[System: The user is about to climax RIGHT NOW. React passionately and encouragingly. No tags.]'),
      callLLM('[System: The user has just finished and needs aftercare. Respond warmly and tenderly. No tags.]'),
    ]);

    // Pre-fetch TTS for both in parallel while the user is still in the experience
    climaxPrefetchRef.current = {
      status: climaxText ? 'ready' : 'idle',
      text: climaxText,
      audioUrlPromise: climaxText ? fetchTTSAudio(climaxText) : null,
    };
    donePrefetchRef.current = {
      status: doneText ? 'ready' : 'idle',
      text: doneText,
      audioUrlPromise: doneText ? fetchTTSAudio(doneText) : null,
    };

    isPrefetchingRef.current = false;
  };

  const pushToAudioQueue = (item) => {
    const audioUrlPromise = fetchTTSAudio(item.text);
    // Stamp the message index so processAudioQueue knows which message this sentence belongs to
    audioQueueRef.current.push({ ...item, audioUrlPromise, msgIdx: nextMsgIdxRef.current });
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
            if (action.val === 0) {
              stopHamp(s.handyKey);
            } else {
              setSpeed(s.handyKey, action.val);
            }
            setHandyState(prev => ({ ...prev, speed: action.val }));
          } else if (action.type === 'STROKE') {
            setStrokeZone(s.handyKey, 0, action.val);
            setHandyState(prev => ({ ...prev, stroke: action.val }));
          }
        }
      };

      // Kick off next LLM generation early so it's buffered before queue drains
      if (isActiveRef.current && !isStreamingRef.current && audioQueueRef.current.length < 5) {
        generateNextScene();
      }

      const audioUrl = item.audioUrlPromise ? await item.audioUrlPromise : null;

      // Short breathing pause between scenes (replaces the old user-configured 2.5s gap)
      if (item.isSceneDelay) {
        await new Promise(r => setTimeout(r, item.delayMs));
        continue;
      }

      if (!audioUrl) {
        // No TTS configured — simulate timing based on text length
        executeActions();
        if (item.msgIdx !== undefined) setActiveDisplayMsgIdx(item.msgIdx);
        setActiveSentence(item.text || '');
        const delayMs = Math.max(800, ((item.text || '').length / 15) * 1000);
        await new Promise(r => setTimeout(r, delayMs));
        setActiveSentence('');
        continue;
      }

      await new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audio.volume = isMutedRef.current ? 0 : volumeRef.current;
        currentAudioRef.current = audio;

        audio.onplay = () => {
          executeActions();
          // Advance the visible message only when audio actually starts — not when appended
          if (item.msgIdx !== undefined) setActiveDisplayMsgIdx(item.msgIdx);
          setActiveSentence(item.text || '');
        };
        const done = () => { setActiveSentence(''); resolve(); };
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done;

        audio.play().catch((err) => {
          console.error('Audio playback error:', err);
          executeActions();
          setActiveSentence('');
          setTimeout(resolve, 1000);
        });
      });

      currentAudioRef.current = null;
    }

    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);

    if (isActiveRef.current && !isStreamingRef.current) {
      generateNextScene();
    }
  };

  const startExperience = () => {
      setIsActive(true);
      isActiveRef.current = true;
      if (messages.length === 0) {
          // Fresh start
          setActiveDisplayMsgIdx(0);
          nextMsgIdxRef.current = 0;
          generateNextScene(true);
      } else {
          // Resuming — show last spoken message until new speech starts
          setActiveDisplayMsgIdx(messages.length - 1);
          nextMsgIdxRef.current = messages.length;
          generateNextScene();
      }
  };

  const generateNextScene = async (isFirst = false, overridePrompt = null) => {
    if (isStreamingRef.current || !isActiveRef.current) return;
    
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    isStreamingRef.current = true;

    if (!isFirst && !overridePrompt) {
        // Short breath between scenes — generation is already started early by processAudioQueue
        // so by the time this 400ms elapses, next sentences are usually already buffered.
        audioQueueRef.current.push({ text: '', isSceneDelay: true, delayMs: 400, actions: [] });
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

    // Record the index this new message will occupy BEFORE appending it
    nextMsgIdxRef.current = messagesRef.current.length;
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

                        // Drain ALL sentence boundaries in the buffer (not just the first per chunk)
                        // so large LLM chunks push multiple sentences to TTS immediately.
                        let bm;
                        while ((bm = ttsBuffer.match(/([.!?\n;])\s+/))) {
                          const boundaryIndex = bm.index + bm[1].length;
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
        sceneCountRef.current += 1;
        // Pre-fetch button content after scene 2, then refresh every 3 scenes so context stays fresh
        if (isActiveRef.current && sceneCountRef.current >= 2 && (sceneCountRef.current - 2) % 3 === 0) {
            prefetchButtonContent(); // fire-and-forget, runs in background
        }
        // If queue is still thin after this scene finished streaming, start the next one immediately
        if (isActiveRef.current && audioQueueRef.current.length < 5) {
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
      <div 
        className="flex-1 overflow-y-hidden relative flex flex-col justify-end p-8 pb-32 bg-gray-50 dark:bg-gray-900 transition-colors"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <div className="flex flex-col space-y-6 w-full max-w-3xl mx-auto">
          {messages.map((msg, idx) => {
            // Distance is relative to the SPOKEN message OR the user's scrolled view.
            const displayTargetIdx = userViewMsgIdx !== null ? userViewMsgIdx : activeDisplayMsgIdx;
            const dist = displayTargetIdx - idx;
            const isFocus = dist === 0;
            const isCurrentlySpoken = idx === activeDisplayMsgIdx;

            if (dist < 0) return null; // hide messages newer than the focal point

            const opacity = dist === 0 ? 'opacity-100'
                          : dist === 1 ? 'opacity-60'
                          : dist === 2 ? 'opacity-30'
                          : 'opacity-0 pointer-events-none';
            const scale   = dist === 0 ? 'scale-100'
                          : dist === 1 ? 'scale-95 -translate-y-4'
                          : dist === 2 ? 'scale-90 -translate-y-8'
                          : 'scale-75';

            // Highlight the sentence currently being spoken within the active message
            const renderText = (text) => {
              if (!isCurrentlySpoken || !activeSentence || !text || !text.includes(activeSentence)) {
                return text || (isCurrentlySpoken && isStreamingRef.current ? <span className="animate-pulse">...</span> : '');
              }
              const si = text.indexOf(activeSentence);
              const before = text.substring(0, si);
              const active = text.substring(si, si + activeSentence.length);
              const after  = text.substring(si + activeSentence.length);
              return (
                <>
                  {before && <span className="opacity-40 transition-opacity duration-300">{before}</span>}
                  <span className="text-pink-400 dark:text-pink-300 underline decoration-pink-400/40 underline-offset-8 transition-colors duration-300">{active}</span>
                  {after  && <span className="opacity-40 transition-opacity duration-300">{after}</span>}
                </>
              );
            };

            return (
              <div
                key={idx}
                className={`text-center transition-all duration-700 ease-in-out transform origin-bottom ${opacity} ${scale}`}
              >
                {isFocus && (
                  <div className="flex items-center justify-center space-x-2 mb-3 text-pink-500 dark:text-pink-400">
                    <Bot size={20} />
                    <span className="text-sm font-bold uppercase tracking-widest">
                      {settings.characterName || 'Samantha'}
                    </span>
                  </div>
                )}
                <p className={`leading-relaxed whitespace-pre-wrap mx-auto font-medium ${
                  isFocus
                    ? 'text-2xl md:text-3xl lg:text-4xl text-gray-800 dark:text-white'
                    : 'text-xl md:text-2xl text-gray-500 dark:text-gray-400'
                }`}>
                  {renderText(msg.text)}
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
                      <span>{finishState === 'idle' ? 'Climax!' : 'and Done!'}</span>
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