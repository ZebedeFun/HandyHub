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

// Live sentences and background prefetch share one Kokoro instance, so requests
// are scheduled rather than fired at will. Measured against kokoro-fastapi-cpu
// on a 4-core host: one request for a 100-character sentence takes 3.7s, while
// two of them in parallel take 8.9s EACH. Overlapping requests therefore delay
// the very chunk that is about to play, so synthesis runs one at a time and the
// queue is ordered by priority instead — live speech always next, background
// prefetch only in the gaps.
const MAX_CONCURRENT_TTS = 1;
const TTS_PRIORITY_LIVE = 0;
const TTS_PRIORITY_PREFETCH = 1;

// Short lines repeat constantly ("Mmm.", "Good boy."). Re-synthesising one costs
// a full round trip for a byte-identical result, so keep the last few blobs.
const TTS_CACHE_MAX = 40;

// Sentence/clause boundary: a terminator plus any closing quote, then space.
// The trailing \s keeps decimals and abbreviations from being split.
const BOUNDARY_RE = /([.!?\u2026](?:["'\u2019\u201d)\]]+)?|[\n;])\s/;

// Repaint budget for streamed text. Without it every SSE token re-renders the
// whole transcript, which is what makes long scenes stutter on a phone.
const DISPLAY_THROTTLE_MS = 80;

// The model is told not to write asterisk actions but still slips them in, and
// markdown/emoji reach Kokoro's phonemiser as literal characters. Strip them
// from what is spoken; the on-screen text keeps everything.
function sanitizeForTTS(text) {
  if (!text) return '';
  return text
    .replace(/\*[^*]*\*/g, ' ')                    // *giggles* — stage direction, not speech
    .replace(/\[[^\]]*\]/g, ' ')                   // any leftover [TAG]
    .replace(/[*_`~#]/g, ' ')                      // stray markdown
    .replace(/\p{Extended_Pictographic}/gu, ' ')   // emoji
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull speakable chunks out of a streaming buffer.
 *
 * Sentences are split off first, then glued back together until the chunk is
 * long enough to be worth a Kokoro call: a lone "Mmm." pays the engine's fixed
 * per-request cost and restarts its prosody, which is what made per-sentence
 * playback sound clipped. Oversized chunks have the opposite problem — the
 * queue stalls with nothing to play — so anything past maxChars is cut at the
 * last word break inside it.
 *
 * Returns the chunks ready to speak and the text still waiting for more input.
 */
function takeChunks(buffer, minChars, maxChars, flushTail) {
  const chunks = [];
  let pending = '';
  let rest = buffer;

  const emit = () => {
    const t = pending.trim();
    pending = '';
    if (t) chunks.push(t);
  };

  let m;
  while ((m = rest.match(BOUNDARY_RE))) {
    const end = m.index + m[0].length;
    pending += rest.slice(0, end);
    rest = rest.slice(end);
    if (pending.trim().length >= minChars) emit();
  }

  // Nothing has terminated in a long while (run-on delivery, or a model that
  // forgets to punctuate): cut at a word break rather than hold up playback.
  while (pending.length + rest.length >= maxChars) {
    const combined = pending + rest;
    const space = combined.slice(0, maxChars).lastIndexOf(' ');
    const cut = space > minChars ? space : maxChars;
    const piece = combined.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = combined.slice(cut).trimStart();
    pending = '';
  }

  if (flushTail) {
    pending += rest;
    rest = '';
    emit();
  }

  return { chunks, rest: pending + rest };
}

// Splits an SSE byte stream into complete `data:` payloads.
// Network chunks do not respect line boundaries: a single `data: {...}` line is
// regularly delivered in two pieces. Parsing each chunk on its own therefore
// drops whichever line straddled the boundary, silently losing words and
// [HANDY_...] tags. Carrying the trailing partial line over to the next read is
// what makes the stream lossless.
function createSSEParser() {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const toPayload = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return null;
    return trimmed.slice(5).trim();
  };

  return {
    // Complete payloads contained in this chunk (the partial tail is retained).
    push(value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      return lines.map(toPayload).filter(Boolean);
    },
    // Whatever complete payload is left once the stream ends.
    flush() {
      const rest = buffer;
      buffer = '';
      const payload = toPayload(rest);
      return payload ? [payload] : [];
    },
  };
}

// Pulls the incremental text out of one OpenAI-style SSE payload.
function deltaFromPayload(payload) {
  try {
    return JSON.parse(payload).choices[0]?.delta?.content || '';
  } catch (e) {
    return '';
  }
}

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
  const [customPersonaDescription, setCustomPersonaDescription] = useState('');
  const [customPersonaName, setCustomPersonaName] = useState('');
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
  const [customSavedPersonas, setCustomSavedPersonas] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('handyTimeCustomPersonas')) || [];
    } catch(e) { return []; }
  });
  // Tracks which message index is currently being spoken (not just the newest one)
  const [activeDisplayMsgIdx, setActiveDisplayMsgIdx] = useState(0);
  // Surfaced when Kokoro fails: without it a bad URL or a stopped container is
  // indistinguishable from "the voice just went quiet", because the queue falls
  // back to text-length timing and carries on.
  const [ttsError, setTtsError] = useState('');

  const selectedPersonaRef = useRef(selectedPersona);
  const customPersonaPromptRef = useRef(customPersonaPrompt);
  
  useEffect(() => { selectedPersonaRef.current = selectedPersona; }, [selectedPersona]);
  useEffect(() => { customPersonaPromptRef.current = customPersonaPrompt; }, [customPersonaPrompt]);

  
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(false);
  const settingsRef = useRef(settings);
  const isActiveRef = useRef(isActive);
  const loopTimerRef = useRef(null);
  
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  // Aborts the in-flight /api/chat stream. Clearing isStreamingRef alone only
  // unlocks a second generateNextScene while the first keeps writing into the
  // same message, so the fetch itself has to be cancelled.
  const streamAbortRef = useRef(null);
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

  // --- TTS scheduling, cancellation and cache ---
  const ttsInFlightRef = useRef(0);
  // Waiters are [{ priority, resolve }]; the lowest priority number goes first.
  const ttsWaitQueueRef = useRef([]);
  // Every in-flight request, so STOP can cancel work already sent to Kokoro.
  const ttsAbortsRef = useRef(new Set());
  // key -> Blob, insertion-ordered so the oldest entry is the one evicted.
  const ttsCacheRef = useRef(new Map());
  // Bumped on STOP: a request that was still queued when the scene was cancelled
  // wakes up, sees a stale epoch and gives up instead of calling Kokoro.
  const ttsEpochRef = useRef(0);
  // Last speed/stroke actually sent to the device, to skip no-op API calls.
  const lastDeviceRef = useRef({ speed: null, stroke: null });



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

  const generateCustomPersona = async () => {
    setIsGeneratingPersona(true);
    try {
       const systemPrompt = "You are a prompt engineer for an adult interactive fiction AI. The user will describe a persona for a tactile VR experience. Your job is to output ONLY the persona instructions (in second person, e.g., 'You are...'). Incorporate their pacing and attitude. You MUST include instructions on how the AI should use [HANDY_SPEED: 0-100] and [HANDY_STROKE: 0-100] tags. Output ONLY the raw prompt text, no intro, no outro, no markdown blocks.";
       
       const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: customPersonaDescription }],
            apiKey: settingsRef.current.llmApiKey,
            llmUrl: settingsRef.current.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
            llmModel: settingsRef.current.llmModel || 'mistralai/mistral-7b-instruct:free',
            llmTemperature: 0.7,
            systemPrompt: systemPrompt
          }),
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const sse = createSSEParser();
        let out = '';
        let finished = false;
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const payload of sse.push(value)) {
            if (payload === '[DONE]') { finished = true; break; }
            out += deltaFromPayload(payload);
          }
        }
        if (finished) reader.cancel();
        for (const payload of sse.flush()) {
          if (payload !== '[DONE]') out += deltaFromPayload(payload);
        }
        setCustomPersonaPrompt(out.trim());
        if (!customPersonaName) {
           setCustomPersonaName(customPersonaDescription.split(' ').slice(0, 3).join(' ') + '...');
        }
    } catch (err) {
       console.error("Generate error", err);
    } finally {
       setIsGeneratingPersona(false);
    }
  };

  const saveCustomPersona = () => {
     if (!customPersonaPrompt || !customPersonaName) return;
     const newPersona = {
       id: 'custom_' + Date.now(),
       name: customPersonaName,
       prompt: customPersonaPrompt
     };
     const updated = [...customSavedPersonas, newPersona];
     setCustomSavedPersonas(updated);
     localStorage.setItem('handyTimeCustomPersonas', JSON.stringify(updated));
     setSelectedPersona(newPersona);
     setCustomPersonaName('');
     setCustomPersonaPrompt('');
     setCustomPersonaDescription('');
  };

  const deleteCustomPersona = (id) => {
     const updated = customSavedPersonas.filter(p => p.id !== id);
     setCustomSavedPersonas(updated);
     localStorage.setItem('handyTimeCustomPersonas', JSON.stringify(updated));
     setSelectedPersona(PERSONAS[0]);
  };

  // --- Audio Queue System -------------------------------------------------

  // Take a synthesis slot, or wait for one. Waiting requests are served by
  // priority rather than arrival order, so a live sentence overtakes background
  // prefetch that was queued before it.
  const acquireTtsSlot = (priority) => {
    if (ttsInFlightRef.current < MAX_CONCURRENT_TTS) {
      ttsInFlightRef.current += 1;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      ttsWaitQueueRef.current.push({ priority, resolve });
    });
  };

  // Hand the slot straight to the highest-priority waiter (the in-flight count
  // is unchanged in that case — the slot is inherited, not re-acquired).
  const releaseTtsSlot = () => {
    const queue = ttsWaitQueueRef.current;
    if (queue.length === 0) {
      ttsInFlightRef.current = Math.max(0, ttsInFlightRef.current - 1);
      return;
    }
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].priority < queue[best].priority) best = i;
    }
    const [next] = queue.splice(best, 1);
    next.resolve();
  };

  const trackBlobUrl = (blobUrl) => {
    activeBlobUrlsRef.current.add(blobUrl);
    return blobUrl;
  };

  const cacheTtsBlob = (key, blob) => {
    const cache = ttsCacheRef.current;
    cache.set(key, blob);
    while (cache.size > TTS_CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
  };

  const fetchTTSAudio = useCallback(async (text, priority = TTS_PRIORITY_LIVE) => {
    const s = settingsRef.current;
    // What gets spoken is not what gets displayed: tags, stage directions and
    // emoji are stripped here so Kokoro never has to phonemise them.
    const spoken = sanitizeForTTS(text);
    if (!spoken) return null;

    if (!s.kokoroUrl) {
      setTtsError('No Kokoro URL set — add one in Settings to hear the voice.');
      return null;
    }

    const epoch = ttsEpochRef.current;
    const voice = s.kokoroVoice || 'af_bella';
    const speed = Number(s.ttsSpeed) || 1;
    const cacheKey = `${voice}|${speed}|${spoken}`;

    const cached = ttsCacheRef.current.get(cacheKey);
    if (cached) {
      // Refresh recency, then hand out a fresh object URL — the previous one is
      // revoked as soon as its playback ends.
      ttsCacheRef.current.delete(cacheKey);
      ttsCacheRef.current.set(cacheKey, cached);
      return trackBlobUrl(URL.createObjectURL(cached));
    }

    await acquireTtsSlot(priority);

    // Queued behind synthesis that was still running when STOP was pressed.
    if (epoch !== ttsEpochRef.current) {
      releaseTtsSlot();
      return null;
    }

    const controller = new AbortController();
    ttsAbortsRef.current.add(controller);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: spoken,
          kokoroUrl: s.kokoroUrl,
          kokoroVoice: voice,
          ttsSpeed: speed,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || `Kokoro returned ${res.status}`);
      }
      const blob = await res.blob();
      cacheTtsBlob(cacheKey, blob);
      setTtsError('');
      return trackBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      // A cancelled request is a deliberate STOP, not a fault worth reporting.
      if (err.name === 'AbortError') return null;
      console.error('TTS Fetch Error:', err);
      setTtsError(String(err.message || err).slice(0, 200));
      return null;
    } finally {
      ttsAbortsRef.current.delete(controller);
      releaseTtsSlot();
    }
  }, []);

  // Cancel everything Kokoro is still working on, and free any waiter that will
  // never get a slot. Without this a STOP leaves the engine synthesising audio
  // for a scene that no longer exists, slowing down whatever comes next.
  const cancelPendingTTS = useCallback(() => {
    ttsEpochRef.current += 1;
    for (const controller of ttsAbortsRef.current) controller.abort();
    ttsAbortsRef.current.clear();
    const waiters = ttsWaitQueueRef.current;
    ttsWaitQueueRef.current = [];
    ttsInFlightRef.current = 0;
    for (const waiter of waiters) waiter.resolve();
  }, []);

  const emergencyStop = useCallback(() => {
    setIsActive(false);
    isActiveRef.current = false;
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);

    // 0. Cancel any scene still streaming from the LLM
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    isStreamingRef.current = false;

    // 0b. Cancel synthesis in flight or queued, so Kokoro is not still working
    // on a scene that no longer exists when the next one starts.
    cancelPendingTTS();

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
    // The device was commanded directly, so the de-dupe cache no longer
    // reflects it — clear it or the next identical tag would be skipped.
    lastDeviceRef.current = { speed: null, stroke: null };

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
  }, [cancelPendingTTS]);

  const handleFinishClick = () => {
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
    // Cancel the scene in flight before unlocking, or it keeps streaming into
    // the same message alongside the climax scene we are about to start.
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
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
      lastDeviceRef.current = { speed: 80, stroke: 100 };
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
      lastDeviceRef.current = { speed: 20, stroke: 40 };
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
  const prefetchButtonContent = useCallback(async () => {
    if (isPrefetchingRef.current || !isActiveRef.current) return;
    const s = settingsRef.current;

    isPrefetchingRef.current = true;
    climaxPrefetchRef.current = { status: 'fetching', text: '', audioUrlPromise: null };
    donePrefetchRef.current   = { status: 'fetching', text: '', audioUrlPromise: null };

    // Fix consecutive assistant roles bug without causing runaway length:
    // Interleave dummy user prompts between each assistant message so the LLM sees short, individual turns.
    const recentMessages = messagesRef.current.slice(-10); // Last 10 for prefetch context
    let recentCtx = [];
    if (recentMessages.length > 0) {
        recentMessages.forEach((msg, i) => {
           const pText = i === 0 ? '(Please start the scene and begin playing with me)' : '(Please continue the scene, moving the situation slowly forward)';
           recentCtx.push({ role: 'user', content: pText });
           recentCtx.push({ role: 'assistant', content: msg.text });
        });
    }

    const currentPersona = selectedPersonaRef.current;
    const currentPersonaPrompt = currentPersona.id === 'custom' ? customPersonaPromptRef.current : currentPersona.prompt;
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
      const sse = createSSEParser();
      let out = '';
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const payload of sse.push(value)) {
          if (payload === '[DONE]') { finished = true; break; }
          out += deltaFromPayload(payload);
        }
      }
      if (finished) reader.cancel();
      for (const payload of sse.flush()) {
        if (payload !== '[DONE]') out += deltaFromPayload(payload);
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
      audioUrlPromise: climaxText ? fetchTTSAudio(climaxText, TTS_PRIORITY_PREFETCH) : null,
    };
    donePrefetchRef.current = {
      status: doneText ? 'ready' : 'idle',
      text: doneText,
      audioUrlPromise: doneText ? fetchTTSAudio(doneText, TTS_PRIORITY_PREFETCH) : null,
    };

    isPrefetchingRef.current = false;
  }, [selectedPersona, customPersonaPrompt, fetchTTSAudio]);

  const pushToAudioQueue = (item) => {
    const audioUrlPromise = fetchTTSAudio(item.text);
    // Stamp the message index so processAudioQueue knows which message this sentence belongs to
    audioQueueRef.current.push({ ...item, audioUrlPromise, msgIdx: nextMsgIdxRef.current });
    processAudioQueue();
  };

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

  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    setIsPlayingQueue(true);

    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift();
      const s = settingsRef.current;

      // Only the final value of each type matters — the intermediate ones would
      // be overwritten within milliseconds — and re-sending a value the device
      // already holds just burns through the handyfeeling rate limit.
      const executeActions = () => {
        if (!item.actions || item.actions.length === 0) return;

        let speed = null;
        let stroke = null;
        for (const action of item.actions) {
          if (action.type === 'SPEED') speed = action.val;
          else if (action.type === 'STROKE') stroke = action.val;
        }

        // Stroke zone first, so a speed change lands on the intended depth.
        if (stroke !== null && stroke !== lastDeviceRef.current.stroke) {
          setStrokeZone(s.handyKey, 0, stroke);
          lastDeviceRef.current.stroke = stroke;
          setHandyState(prev => ({ ...prev, stroke }));
        }
        if (speed !== null && speed !== lastDeviceRef.current.speed) {
          if (speed === 0) stopHamp(s.handyKey);
          else setSpeed(s.handyKey, speed);
          lastDeviceRef.current.speed = speed;
          setHandyState(prev => ({ ...prev, speed }));
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
  };

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

  const generateNextScene = async (isFirst = false, overridePrompt = null) => {
    if (isStreamingRef.current || !isActiveRef.current) return;
    
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    isStreamingRef.current = true;

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    if (!isFirst && !overridePrompt) {
        // Breath between scenes. This is the Scene Delay slider in Settings,
        // which used to be saved and displayed but never read — the pause was
        // hardcoded to 400ms no matter where the slider sat.
        const configured = parseFloat(settingsRef.current.sceneDelay);
        const delayMs = Math.round((Number.isFinite(configured) ? configured : 2.5) * 1000);
        if (delayMs > 0) {
            audioQueueRef.current.push({ text: '', isSceneDelay: true, delayMs, actions: [] });
            processAudioQueue();
        }
    }

    let apiMessages = [];
    const currentPersonaPrompt = selectedPersonaRef.current.id === 'custom' ? customPersonaPromptRef.current : selectedPersonaRef.current.prompt;

    const promptText = overridePrompt || (isFirst ? `(Please start the scene and begin playing with me)` : `(Please continue the scene, moving the situation slowly forward)`);
    const userMessage = { role: 'user', content: `[System Reminder: Adopt the following persona strictly: ${currentPersonaPrompt}]\n\n${promptText}` };

    if (isFirst || messagesRef.current.length === 0) {
        apiMessages = [userMessage];
    } else {
        // Fix consecutive assistant roles bug WITHOUT causing runaway length:
        // Interleave dummy user prompts between each assistant message so the LLM sees short, individual turns.
        const historyMessages = messagesRef.current.slice(-30);
        apiMessages = [];
        historyMessages.forEach((msg, i) => {
           const pText = i === 0 ? '(Please start the scene and begin playing with me)' : '(Please continue the scene, moving the situation slowly forward)';
           apiMessages.push({ role: 'user', content: pText });
           apiMessages.push({ role: 'assistant', content: msg.text });
        });
        apiMessages.push(userMessage);
    }

    // Record the index this new message will occupy BEFORE appending it, and
    // write every later update to that index. Targeting "the last message"
    // instead put the stream's tokens into whatever message happened to be
    // appended meanwhile — the Climax pre-cache injects one exactly there.
    const msgIdx = messagesRef.current.length;
    nextMsgIdxRef.current = msgIdx;
    setMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    
    try {
        // Read through the ref: this call is often made from a queue callback
        // captured several renders ago, so the `settings` prop is stale there.
        const s = settingsRef.current;
        const basePrompt = s.systemPrompt.replace(/\[CHARACTER\]/g, s.characterDescription).replace(/\[NAME\]/g, s.characterName || 'Samantha');
        const placementInstruction = "CRITICAL: You must place any [HANDY_...] tags AT THE VERY START of the sentence they apply to, or inline just before the action word. NEVER put tags at the end of a sentence.\nExample: '[HANDY_SPEED:80] Let's go much faster.'";
        const finalSystemPrompt = `IMPORTANT CURRENT MOOD / ROLE: ${currentPersonaPrompt}\n\n${basePrompt}\n\n${placementInstruction}`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: apiMessages,
                apiKey: s.llmApiKey,
                llmUrl: s.llmUrl || 'https://openrouter.ai/api/v1/chat/completions',
                llmModel: s.llmModel || 'mistralai/mistral-7b-instruct:free',
                llmTemperature: parseFloat(s.llmTemperature) || 0.7,
                systemPrompt: finalSystemPrompt
            }),
            signal: abortController.signal
        });

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const sse = createSSEParser();

        let streamBuffer = '';
        let ttsBuffer = '';
        let textToDisplay = '';
        let currentActions = [];
        // Chunk sizing. The first chunk of a scene is deliberately smaller: it
        // is the one the listener is waiting on, and synthesis time scales with
        // length (0.8s for a few words, ~4s for a full sentence on CPU). Later
        // chunks use the configured size, which is what keeps the voice smooth.
        const minChars = Math.max(20, Number(s.ttsChunkChars) || 120);
        const maxChars = Math.max(minChars * 2, 400);
        const firstMinChars = Math.min(minChars, 60);
        let chunksQueued = 0;

        // Actions are attached to the first chunk that follows them and cleared
        // straight away, so a chunk carries only the tags that became current
        // since the previous one.
        const queueChunks = (chunks) => {
            for (const chunk of chunks) {
                pushToAudioQueue({ text: chunk, actions: currentActions });
                currentActions = [];
                chunksQueued += 1;
            }
        };

        // Repainting on every token re-renders the whole transcript; budget it.
        let lastDisplayFlush = 0;
        const flushDisplay = (force) => {
            const now = Date.now();
            if (!force && now - lastDisplayFlush < DISPLAY_THROTTLE_MS) return;
            lastDisplayFlush = now;
            const text = textToDisplay;
            setMessages(prev => prev.map((m, i) => (i === msgIdx ? { ...m, text } : m)));
        };


        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!isActiveRef.current) {
                // If user stopped, abort processing
                reader.cancel();
                break;
            }

            for (const payload of sse.push(value)) {
                if (payload === '[DONE]') continue;
                    const delta = deltaFromPayload(payload);
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

                                // Text written before this tag belongs to the
                                // actions already in force, so it is flushed
                                // here and the new tag starts a fresh group.
                                // This is also what bounds the action list: it
                                // used to accumulate for the whole scene, so
                                // every later chunk replayed every speed and
                                // stroke tag seen so far at the device.
                                if (ttsBuffer.trim().length > 0) {
                                    const flushed = takeChunks(ttsBuffer, minChars, maxChars, true);
                                    ttsBuffer = flushed.rest;
                                    queueChunks(flushed.chunks);
                                }

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

                    // Drain whatever is speakable, coalescing short sentences
                    // into chunks worth a synthesis call. The first chunk of the
                    // scene uses a smaller threshold so speech starts sooner.
                    const drained = takeChunks(
                        ttsBuffer,
                        chunksQueued === 0 ? firstMinChars : minChars,
                        maxChars,
                        false,
                    );
                    ttsBuffer = drained.rest;
                    queueChunks(drained.chunks);

                    flushDisplay(false);

            }
        }

        // A stream that ends without a trailing newline leaves one complete
        // payload in the parser. Fold it into streamBuffer so the tail handling
        // below picks it up rather than dropping it.
        for (const payload of sse.flush()) {
            if (payload !== '[DONE]') streamBuffer += deltaFromPayload(payload);
        }

        if (isActiveRef.current && streamBuffer) {
            ttsBuffer += streamBuffer;
            textToDisplay += streamBuffer;
        }
        flushDisplay(true);

        // Nothing more is coming, so the tail is spoken whatever its length.
        if (isActiveRef.current && ttsBuffer.trim().length > 0) {
            const tail = takeChunks(ttsBuffer, minChars, maxChars, true);
            ttsBuffer = tail.rest;
            queueChunks(tail.chunks);
        }
        
    } catch (err) {
        // An abort is a deliberate interruption (STOP / Climax), not a failure.
        if (err.name !== 'AbortError') console.error("Chat Error:", err);
    } finally {
        // Only release the lock if a newer scene has not already taken over.
        if (streamAbortRef.current === abortController) {
            streamAbortRef.current = null;
            isStreamingRef.current = false;
        }
        sceneCountRef.current += 1;
        // Pre-fetch button content after scene 2, then refresh every 3 scenes so context stays fresh
        if (isActiveRef.current && sceneCountRef.current >= 2 && (sceneCountRef.current - 2) % 3 === 0) {
            prefetchButtonContent(); // fire-and-forget, runs in background
        }
        // NOTE: generateNextScene() is now ONLY called from processAudioQueue (not here)
        // to prevent race conditions from multiple trigger points.
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 max-w-4xl mx-auto w-full shadow-lg border-x border-transparent dark:border-gray-800 transition-colors relative">
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center transition-colors overflow-x-auto relative z-10">
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:block">Passive Experience</span>
        <div className="flex items-center space-x-3 sm:space-x-4 ml-auto">
          <div className="flex items-center space-x-2 border-r pr-3 sm:pr-4 border-gray-200 dark:border-gray-700">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:block">Experience:</label>
            <select
              value={selectedPersona.id}
              onChange={(e) => {
                 const p = PERSONAS.find(p => p.id === e.target.value) || customSavedPersonas.find(p => p.id === e.target.value);
                 if (p) setSelectedPersona(p);
              }}
              disabled={isActive}
              className="bg-gray-100 dark:bg-gray-700 border-none text-sm rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 outline-none disabled:opacity-50"
            >
              <optgroup label="Standard">
                {PERSONAS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              {customSavedPersonas.length > 0 && (
                <optgroup label="Saved Custom">
                  {customSavedPersonas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedPersona.id.startsWith('custom_') && !isActive && (
              <button 
                onClick={() => deleteCustomPersona(selectedPersona.id)}
                className="text-xs text-red-500 hover:text-red-600 transition-colors ml-2 font-medium"
              >
                Delete
              </button>
            )}
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

      {ttsError && (
        <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3 z-10">
          <span className="text-sm text-amber-800 dark:text-amber-300">
            <strong>Voice unavailable:</strong> {ttsError} Scenes keep playing as text.
          </span>
          <button
            onClick={() => setTtsError('')}
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {selectedPersona.id === 'custom' && (
        <div className="bg-gray-100 dark:bg-gray-800/50 border-b dark:border-gray-700 px-4 py-4 flex flex-col space-y-4 z-0">
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Persona Generator</label>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <input
                 type="text"
                 value={customPersonaDescription}
                 onChange={(e) => setCustomPersonaDescription(e.target.value)}
                 disabled={isActive || isGeneratingPersona}
                 className="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 transition-colors"
                 placeholder="Describe the persona (e.g., 'a strict teacher who punishes fast')"
              />
              <button 
                 onClick={generateCustomPersona}
                 disabled={isActive || isGeneratingPersona || !customPersonaDescription.trim()}
                 className="bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 dark:disabled:bg-pink-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {isGeneratingPersona ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
          </div>
          
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Generated Prompt</label>
            <textarea
              value={customPersonaPrompt}
              onChange={(e) => setCustomPersonaPrompt(e.target.value)}
              disabled={isActive}
              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 transition-colors"
              rows="3"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
             <input 
                type="text" 
                placeholder="Persona Name (to save)" 
                value={customPersonaName} 
                onChange={e => setCustomPersonaName(e.target.value)} 
                disabled={isActive}
                className="w-full sm:w-auto bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-pink-500 transition-colors" 
             />
             <button 
                onClick={saveCustomPersona} 
                disabled={isActive || !customPersonaPrompt.trim() || !customPersonaName.trim()}
                className="w-full sm:w-auto bg-green-500 hover:bg-green-600 disabled:bg-green-300 dark:disabled:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
             >
                Save Persona
             </button>
          </div>
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
