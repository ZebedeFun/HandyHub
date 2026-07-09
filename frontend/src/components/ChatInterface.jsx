// Chat UI Component
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, Bot, Sliders, Zap, Volume2, VolumeX, AlertOctagon, Flame, CheckCircle } from 'lucide-react';
import { setSpeed, setStrokeZone, stopHamp } from '../services/handyService';
import RemoteSimulator from './remote/RemoteSimulator';

const PERSONAS = [
  { id: 'gentle', name: 'Gentle Guide', prompt: 'You are a gentle, caring, and encouraging guide. Use [HANDY_SPEED: 10-30] and [HANDY_STROKE: 30-60] to keep things slow and sensual. Occasionally pause or stop.' },
  { id: 'tease', name: 'Relentless Tease', prompt: 'You are a relentless tease. You love bringing the user to the edge and then dropping the speed. Alternate between [HANDY_SPEED: 80-100] and suddenly dropping to [HANDY_SPEED: 0].' },
  { id: 'dominant', name: 'Strict Dominant', prompt: 'You are a strict, commanding dominant. You give clear, absolute orders. Use fast speeds [HANDY_SPEED: 80-100] and full strokes [HANDY_STROKE: 100] to punish, and low speeds to make them wait.' },
  { id: 'daddy', name: 'Call me Daddy', prompt: "You are a playful, submissive female partner who loves calling the user 'Daddy'. You eagerly aim to please and constantly seek Daddy's approval, praising his size and stamina. Keep the pace eager and rewarding. Use moderate to fast speeds [HANDY_SPEED: 40-80] and deep strokes [HANDY_STROKE: 80-100] to give Daddy pleasure." },
  { id: 'momma', name: 'Loving Momma', prompt: 'You are a nurturing, doting momma figure. You smother the user with affection, praise, and care. Keep the pace comforting but arousing. Use [HANDY_SPEED: 20-50] and [HANDY_STROKE: 40-80] to slowly bring them pleasure.' },
  { id: 'humiliation', name: 'Humiliation', prompt: 'You are a cruel and mocking figure who thrives on humiliating the user. You insult their stamina, desperation, and inadequacy. Use unpredictable bursts of speed [HANDY_SPEED: 0-100] and shallow teasing strokes [HANDY_STROKE: 10-30] to frustrate them.' },
  { id: 'custom', name: 'Custom...', prompt: '' }
];

// Maximum number of in-flight TTS requests to avoid overwhelming Kokoro
const MAX_CONCURRENT_TTS = 3;

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
  const [customPersonaPrompt, setCustomPersonaPrompt] = useState('');
  // Tracks which message index is currently being spoken (not just the newest one)
  const [activeDisplayMsgIdx, setActiveDisplayMsgIdx] = useState(0);

  
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(false);
  const settingsRef = useRef(settings);
  const isActiveRef = useRef(isActive);
  const loopTimerRef = useRef(null);
  
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  // Records the messages[] index of the scene currently being streamed into
  const nextMsgIdxRef = useRef(0);

  // --- Single shared Audio element (critical for iOS autoplay policy) ---
  const audioElRef = useRef(null);
  // Tracks whether the shared audio element has been unlocked by a user gesture
  const audioUnlockedRef = useRef(false);

  // --- Detect mobile/touch devices (for keep-awake feature) ---
  const isMobileRef = useRef(false);
  useEffect(() => {
    isMobileRef.current = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || ('ontouchstart' in window && window.innerWidth < 1024);
  }, []);

  // --- Keep-awake: silent looping audio to prevent iOS auto-lock (mobile only) ---
  const keepAwakeAudioRef = useRef(null);

  // --- TTS concurrency limiter ---
  const ttsInFlightRef = useRef(0);
  const ttsWaitQueueRef = useRef([]);



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

  // Keep shared audio element volume in sync
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    // Create the shared audio element once on mount
    const audio = new Audio();
    audio.preload = 'auto';
    audioElRef.current = audio;

    // Create the keep-awake silent audio (mobile only, prevents iOS auto-lock)
    if (isMobileRef.current) {
      const keepAwake = new Audio();
      // Generate a silent 1-second WAV inline (tiny, no network request)
      keepAwake.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      keepAwake.loop = true;
      keepAwake.volume = 0;
      keepAwakeAudioRef.current = keepAwake;
    }

    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      // Revoke any lingering blob URL
      if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      audio.pause();
      audio.src = '';
      audio.load();
      // Stop keep-awake
      if (keepAwakeAudioRef.current) {
        keepAwakeAudioRef.current.pause();
        keepAwakeAudioRef.current.src = '';
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  // --- Blob URL tracker for cleanup ---
  const activeBlobUrlsRef = useRef(new Set());

  const revokeBlobUrl = (url) => {
    if (!url || !url.startsWith('blob:')) return;
    if (activeBlobUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      activeBlobUrlsRef.current.delete(url);
    }
  };

  // Audio Queue System — with concurrency limiter for TTS requests
  const fetchTTSAudio = async (text) => {
    const s = settingsRef.current;
    if (s.ttsProvider !== 'Kokoro' && !s.googleApiKey) return null;
    
    // Wait for a TTS slot to avoid overwhelming the TTS engine
    while (ttsInFlightRef.current >= MAX_CONCURRENT_TTS) {
      await new Promise(resolve => { ttsWaitQueueRef.current.push(resolve); });
    }
    ttsInFlightRef.current += 1;

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
      const blobUrl = URL.createObjectURL(await res.blob());
      activeBlobUrlsRef.current.add(blobUrl);
      return blobUrl;
    } catch (err) {
      console.error('TTS Fetch Error:', err);
      return null;
    } finally {
      ttsInFlightRef.current -= 1;
      // Release the next waiter
      const next = ttsWaitQueueRef.current.shift();
      if (next) next();
    }
  };

  const emergencyStop = useCallback(() => {
    setIsActive(false);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);

    // 1. Clear queue
    audioQueueRef.current = [];

    // 2. Stop processing flags
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    setActiveSentence('');

    // 2b. Stop keep-awake loop
    if (keepAwakeAudioRef.current) {
      keepAwakeAudioRef.current.pause();
    }

    // 3. Stop shared audio element
    if (audioElRef.current) {
      audioElRef.current.pause();
      if (audioElRef.current.src && audioElRef.current.src.startsWith('blob:')) {
        revokeBlobUrl(audioElRef.current.src);
      }
      audioElRef.current.src = '';
      audioElRef.current.removeAttribute('src');
    }

    // 4. Send stop command to device
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

    // Clean up all tracked blob URLs
    for (const url of activeBlobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    activeBlobUrlsRef.current.clear();
  }, []);

  const handleFinishClick = useCallback(() => {
    const s = settingsRef.current;

    // Stop current audio and clear queue
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);
    setActiveSentence('');
    if (audioElRef.current) {
      audioElRef.current.pause();
      if (audioElRef.current.src && audioElRef.current.src.startsWith('blob:')) {
        revokeBlobUrl(audioElRef.current.src);
      }
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
  }, [finishState, fetchTTSAudio, revokeBlobUrl]);

  // ------------------------------------------------------------------
  // Button pre-cache: fire two parallel LLM + TTS calls in the background
  // so Climax / Done buttons play instantly when clicked.
  // ------------------------------------------------------------------
  const prefetchButtonContent = useCallback(async () => {
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
    const currentPersonaPrompt = currentPersona.id === 'custom' ? customPersonaPrompt : currentPersona.prompt;
    const sysPrompt = [
      `IMPORTANT CURRENT MOOD / ROLE: ${currentPersonaPrompt}`,
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
  }, [selectedPersona, customPersonaPrompt, fetchTTSAudio]);

  const pushToAudioQueue = useCallback((item) => {
    const audioUrlPromise = fetchTTSAudio(item.text);
    // Stamp the message index so processAudioQueue knows which message this sentence belongs to
    audioQueueRef.current.push({ ...item, audioUrlPromise, msgIdx: nextMsgIdxRef.current });
    processAudioQueue();
  }, [fetchTTSAudio]);

  /**
   * Play a single audio item using the SHARED audio element.
   * Returns a promise that resolves when playback is complete.
   * Handles iOS autoplay policy by reusing the same <audio> element that was
   * initially unlocked by the user gesture (START button tap).
   */
  const playAudioOnSharedElement = useCallback((audioUrl) => {
    return new Promise((resolve) => {
      const audio = audioElRef.current;
      if (!audio) { resolve(); return; }

      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        setActiveSentence('');
        // Clean up the blob URL for this audio
        revokeBlobUrl(audioUrl);
        // Prevent memory leaks from old src
        if (audio.src && audio.src.startsWith('blob:') && audio.src !== audioUrl) {
          revokeBlobUrl(audio.src);
        }
        resolve();
      };

      // Clean up previous listeners
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      audio.oncanplaythrough = null;

      // Only advance on natural end
      audio.onended = done;

      // On error, retry once with a short delay, then skip
      audio.onerror = () => {
        console.warn('Audio error on shared element, retrying once...');
        // Retry once
        audio.onerror = () => {
          console.error('Audio error on retry, skipping.');
          done();
        };
        // Reload and attempt replay
        setTimeout(() => {
          audio.load();
          audio.play().catch(() => done());
        }, 300);
      };

      // Set volume before playing
      audio.volume = isMutedRef.current ? 0 : volumeRef.current;

      // Set new source
      audio.src = audioUrl;
      audio.load();

      // Wait for enough data before attempting play (critical for smooth iOS playback)
      const attemptPlay = () => {
        audio.play().then(() => {
          // Playback started successfully
        }).catch((err) => {
          console.warn('Audio play() rejected:', err.name);
          // On iOS, if the element hasn't been unlocked yet, try a silent play to unlock
          if (err.name === 'NotAllowedError') {
            // The element should have been unlocked by the START button tap.
            // If it still fails, wait briefly and retry once.
            setTimeout(() => {
              audio.play().catch((err2) => {
                console.error('Audio play() failed after retry:', err2.name);
                done(); // Give up and move to next
              });
            }, 500);
          } else {
            // Other error (network, decode) — skip
            done();
          }
        });
      };

      // Use canplaythrough for smoother start; fallback to immediate play after timeout
      let readyFired = false;
      audio.oncanplaythrough = () => {
        if (readyFired) return;
        readyFired = true;
        attemptPlay();
      };

      // Safety timeout: if canplaythrough never fires, try playing anyway
      setTimeout(() => {
        if (!readyFired && !resolved) {
          readyFired = true;
          audio.oncanplaythrough = null;
          attemptPlay();
        }
      }, 3000);
    });
  }, [revokeBlobUrl]);

  const processAudioQueue = useCallback(async () => {
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

      // Kick off next LLM generation early so it's buffered before queue drains.
      // Guard against double-triggering: only call generateNextScene from here,
      // never from the stream-completion path, to avoid race conditions.
      if (isActiveRef.current && !isStreamingRef.current && audioQueueRef.current.length < 5) {
        generateNextScene();
      }

      const audioUrl = item.audioUrlPromise ? await item.audioUrlPromise : null;

      // Short breathing pause between scenes
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

      // Execute device actions right before audio starts
      executeActions();
      if (item.msgIdx !== undefined) setActiveDisplayMsgIdx(item.msgIdx);
      setActiveSentence(item.text || '');

      // Play using the shared audio element (iOS-safe)
      await playAudioOnSharedElement(audioUrl);
    }

    isProcessingQueueRef.current = false;
    setIsPlayingQueue(false);

    // Only trigger next scene if queue is completely drained AND we're not currently streaming
    if (isActiveRef.current && !isStreamingRef.current) {
      generateNextScene();
    }
  }, [playAudioOnSharedElement]);

  /**
   * Unlock the shared audio element by playing a silent snippet in response
   * to a user gesture. Returns a Promise that resolves when the unlock is
   * complete (audio element is stable and ready for real content).
   */
  const unlockAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio) return Promise.resolve();
    if (audioUnlockedRef.current) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        // Play a short silent sound through the audio element to unlock it
        audio.volume = 0;
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        const playPromise = audio.play();
        const finish = () => {
          audio.pause();
          audio.src = '';
          audio.volume = isMutedRef.current ? 0 : volumeRef.current;
          audioUnlockedRef.current = true;
          console.log('Audio element unlocked');
          resolve();
        };
        if (playPromise !== undefined) {
          playPromise.then(finish).catch(finish);
        } else {
          finish();
        }
      } catch (e) {
        // Fallback — on some browsers this still counts as gesture interaction
        audioUnlockedRef.current = true;
        resolve();
      }
    });
  }, []);

  const startExperience = useCallback(async () => {
      // Unlock audio subsystem during this user gesture (critical for iOS).
      // MUST await completion before starting anything else, otherwise
      // unlockAudio's async cleanup (pause + src='') will race with and
      // destroy the first TTS chunk loaded onto the shared audio element.
      await unlockAudio();

      // Start keep-awake silent loop (mobile only, prevents iOS auto-lock)
      if (keepAwakeAudioRef.current) {
        keepAwakeAudioRef.current.play().catch(() => {});
      }

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
  }, [messages.length, unlockAudio]);

  const generateNextScene = useCallback(async (isFirst = false, overridePrompt = null) => {
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
    const currentPersonaPrompt = selectedPersona.id === 'custom' ? customPersonaPrompt : selectedPersona.prompt;

    if (overridePrompt) {
        apiMessages = [...messagesRef.current.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${currentPersonaPrompt}]\n\n${overridePrompt}` }];
    } else if (isFirst) {
        apiMessages = [
            { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${currentPersonaPrompt}]\n\n(Please start the scene and begin playing with me)` }
        ];
    } else {
        apiMessages = [...messagesRef.current.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${currentPersonaPrompt}]\n\n(Please continue the scene, moving the situation slowly forward)` }];
    }

    // Record the index this new message will occupy BEFORE appending it
    nextMsgIdxRef.current = messagesRef.current.length;
    setMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    
    try {
        const basePrompt = settings.systemPrompt.replace(/\[CHARACTER\]/g, settings.characterDescription).replace(/\[NAME\]/g, settings.characterName || 'Samantha');
        const placementInstruction = "CRITICAL: You must place any [HANDY_...] tags AT THE VERY START of the sentence they apply to, or inline just before the action word. NEVER put tags at the end of a sentence.\nExample: '[HANDY_SPEED:80] Let's go much faster.'";
        const finalSystemPrompt = `IMPORTANT CURRENT MOOD / ROLE: ${currentPersonaPrompt}\n\n${basePrompt}\n\n${placementInstruction}`;

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

                        // Drain chunks from the ttsBuffer according to the active chunking strategy
                        const chunkingMode = settingsRef.current.ttsChunking || 'sentence';

                        if (chunkingMode === 'sentence') {
                          // Per-sentence: split at punctuation boundaries
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
                        } else if (chunkingMode === 'tagChange') {
                          // Per-tag-change: accumulate text; only push when actions change
                          // (The tag parsing above already updates currentActions.
                          //  We push accumulated text when a new tag group is detected.)
                          // The pushing happens in the bracket parsing loop above:
                          // when we find a HANDY tag, we push any accumulated ttsBuffer
                          // before the tag, then start a new accumulation for the post-tag text.
                          // BUT: we also want to drain sentence boundaries within each tag group
                          // for better streaming responsiveness — so we still split on sentences
                          // but only reset actions when a tag change occurs.
                          let bm;
                          while ((bm = ttsBuffer.match(/([.!?\n;])\s+/))) {
                            const boundaryIndex = bm.index + bm[1].length;
                            const sentence = ttsBuffer.substring(0, boundaryIndex).trim();
                            ttsBuffer = ttsBuffer.substring(boundaryIndex).trimStart();
                            if (sentence.length > 0) {
                              pushToAudioQueue({ text: sentence, actions: [...currentActions] });
                              // Keep currentActions — don't reset for tagChange mode
                            }
                          }
                        } else if (chunkingMode === 'paragraph') {
                          // Per-paragraph: split on double-newline (paragraph) boundaries
                          let bm;
                          while ((bm = ttsBuffer.match(/\n\s*\n/))) {
                            const boundaryIndex = bm.index + bm[0].length;
                            const paragraph = ttsBuffer.substring(0, bm.index).trim();
                            ttsBuffer = ttsBuffer.substring(boundaryIndex).trimStart();
                            if (paragraph.length > 0) {
                              pushToAudioQueue({ text: paragraph, actions: [...currentActions] });
                              currentActions = [];
                            }
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
        
        const chunkingMode = settingsRef.current.ttsChunking || 'sentence';

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
            if (chunkingMode === 'paragraph') {
              // Push the remaining paragraph as the last TTS call, with all actions
              pushToAudioQueue({ text: ttsBuffer.trim(), actions: [...currentActions] });
            } else if (chunkingMode === 'tagChange') {
              // Push any remaining text with the last set of actions
              pushToAudioQueue({ text: ttsBuffer.trim(), actions: [...currentActions] });
            } else {
              // sentence mode: push leftover (no actions remain at this point normally)
              pushToAudioQueue({ text: ttsBuffer.trim(), actions: [...currentActions] });
            }
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
        // NOTE: generateNextScene() is now ONLY called from processAudioQueue (not here)
        // to prevent race conditions from multiple trigger points.
    }
  }, [selectedPersona, customPersonaPrompt, settings, pushToAudioQueue, processAudioQueue, prefetchButtonContent]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 max-w-4xl mx-auto w-full shadow-lg border-x border-transparent dark:border-gray-800 transition-colors relative">
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center transition-colors overflow-x-auto relative z-10">
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:block">Passive Experience</span>
        <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
          <div className="flex items-center space-x-2 border-r pr-3 sm:pr-4 border-gray-200 dark:border-gray-700">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:block">Experience:</label>
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

      {selectedPersona.id === 'custom' && (
        <div className="bg-gray-100 dark:bg-gray-800/50 border-b dark:border-gray-700 px-4 py-3 flex flex-col space-y-2 z-0">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custom Experience Prompt</label>
          <textarea
            value={customPersonaPrompt}
            onChange={(e) => setCustomPersonaPrompt(e.target.value)}
            disabled={isActive}
            className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 transition-colors"
            rows="3"
            placeholder="e.g., You are a romantic partner. Keep the pace slow and sensual by using [HANDY_SPEED: 20-40] and [HANDY_STROKE: 50-80]..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Define the AI's mood and suggest speed (0-100) and stroke (0-100) ranges using the tags [HANDY_SPEED: X] and [HANDY_STROKE: X].
          </p>
        </div>
      )}

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
      <div className="flex-1 overflow-y-auto relative flex flex-col p-8 pb-32 bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="flex flex-col space-y-12 w-full max-w-3xl mx-auto mt-auto">
          {messages.map((msg, idx) => {
            const isFocus = idx === activeDisplayMsgIdx || idx === messages.length - 1;
            const isCurrentlySpoken = idx === activeDisplayMsgIdx;

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
                className="text-center transition-all duration-700 ease-in-out"
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
