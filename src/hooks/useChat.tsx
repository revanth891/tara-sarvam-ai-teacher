import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
export type Turn = { role: 'user' | 'assistant'; content: string; id: number };
export const LANGUAGES = [['auto','Auto detect'],['en-IN','English'],['hi-IN','हिन्दी'],['te-IN','తెలుగు'],['ta-IN','தமிழ்'],['kn-IN','ಕನ್ನಡ'],['ml-IN','മലയാളം'],['bn-IN','বাংলা'],['mr-IN','मराठी'],['gu-IN','ગુજરાતી'],['pa-IN','ਪੰਜਾਬੀ'],['od-IN','ଓଡ଼ିଆ']] as const;
type Settings = { subject: string; level: string; language: string; lessonMode: string; voiceGender: 'male' | 'female' };
type ChatContextType = { chat: (text: string, language?: string) => Promise<void>; stop: () => void; reset: () => void; toggleRecording: () => Promise<void>; history: Turn[]; loading: boolean; recording: boolean; speaking: boolean; transcribing: boolean; status: string; error: string; settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>>; detectedLanguage: string; timings: Record<string, number>; analyser: React.MutableRefObject<AnalyserNode | null>; audioBlocked: boolean; resumeAudio: () => Promise<void> };
const ChatContext = createContext<ChatContextType | null>(null);
const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export function ChatProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Turn[]>([]); const historyRef = useRef<Turn[]>([]);
  const [settings, setSettings] = useState<Settings>({ subject: 'Science', level: 'Curious beginner', language: 'auto', lessonMode: 'Explain simply', voiceGender: 'male' });
  const [loading, setLoading] = useState(false), [recording, setRecording] = useState(false), [transcribing, setTranscribing] = useState(false), [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(''), [detectedLanguage, setDetectedLanguage] = useState('');
  const [timings, setTimings] = useState<Record<string, number>>({}), [audioBlocked, setAudioBlocked] = useState(false);
  const analyser = useRef<AnalyserNode | null>(null), audioContext = useRef<AudioContext | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>()); const renderTimer = useRef<ReturnType<typeof setTimeout>>();
  const controller = useRef<AbortController | null>(null), epoch = useRef(0), nextPlay = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), recordingTimer = useRef<ReturnType<typeof setTimeout>>();
  const audioChain = useRef(Promise.resolve()), startedAt = useRef(0), firstAudio = useRef(false);
  const resumeAudio = useCallback(async () => {
    if (!audioContext.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContext.current = new AudioCtx({ latencyHint: 'interactive' }); analyser.current = audioContext.current!.createAnalyser();
      analyser.current!.fftSize = 512; analyser.current!.smoothingTimeConstant = .6; analyser.current!.connect(audioContext.current!.destination);
    }
    await audioContext.current!.resume(); setAudioBlocked(audioContext.current!.state !== 'running');
  }, []);
  const stop = useCallback(() => {
    epoch.current++; clearTimeout(renderTimer.current); renderTimer.current = undefined; controller.current?.abort(); controller.current = null;
    sources.current.forEach(source => { try { source.stop(); } catch {} }); sources.current.clear(); nextPlay.current = 0; audioChain.current = Promise.resolve();
    setSpeaking(false); setLoading(false); setTranscribing(false);
    if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
    stream.current?.getTracks().forEach(track => track.stop()); clearTimeout(recordingTimer.current); setRecording(false);
  }, []);
  const reset = useCallback(() => { stop(); historyRef.current = []; setHistory([]); setError(''); setTimings({}); }, [stop]);
  const enqueueAudio = (event: any, requestEpoch: number) => {
    audioChain.current = audioChain.current.then(async () => {
      if (requestEpoch !== epoch.current) return;
      await resumeAudio();
      const bytes = Uint8Array.from(atob(event.audio), char => char.charCodeAt(0));
      const buffer = await audioContext.current!.decodeAudioData(bytes.buffer);
      if (requestEpoch !== epoch.current) return;
      const ctx = audioContext.current!, source = ctx.createBufferSource();
      source.buffer = buffer; source.connect(analyser.current!);
      const at = Math.max(ctx.currentTime + .015, nextPlay.current); nextPlay.current = at + buffer.duration;
      sources.current.add(source);
      source.onended = () => { sources.current.delete(source); if (requestEpoch === epoch.current && sources.current.size === 0) setSpeaking(false); source.disconnect(); };
      source.start(at); setSpeaking(true);
      if (!firstAudio.current) { firstAudio.current = true; setTimings(prev => ({ ...prev, firstAudioMs: Math.round(performance.now() - startedAt.current) })); }
    }).catch(() => { if (requestEpoch === epoch.current) setError('Audio could not play. Your teacher’s answer is still in the transcript.'); });
  };
  const chat = async (input: string, languageOverride?: string) => {
    const text = input.trim(); if (!text) return;
    stop(); await resumeAudio().catch(() => setAudioBlocked(true));
    const requestEpoch = epoch.current, abort = new AbortController(); controller.current = abort;
    startedAt.current = performance.now(); firstAudio.current = false; setLoading(true); setError(''); setTimings({});
    const previous = historyRef.current.slice(-12), id = Date.now();
    const userTurn: Turn = { role: 'user', content: text, id }, pending: Turn = { role: 'assistant', content: '', id: id + 1 };
    historyRef.current = [...previous, userTurn]; setHistory([...previous, userTurn, pending]); let reply = ''; const flushTranscript = () => { renderTimer.current = undefined; if (requestEpoch === epoch.current) setHistory([...previous, userTurn, { ...pending, content: reply }]); };
    const receive = (event: any) => {
      if (requestEpoch !== epoch.current) return;
      if (event.type === 'text') { if (!reply) setTimings(prev => ({ ...prev, firstTextMs: Math.round(performance.now() - startedAt.current) })); const first = !reply; reply += event.text || event.delta || ''; if (first) flushTranscript(); else if (!renderTimer.current) renderTimer.current = setTimeout(flushTranscript, 80); }
      else if (event.type === 'audio' && event.audio) enqueueAudio(event, requestEpoch);
      else if (event.type === 'done') { setTimings(prev => ({ ...event.timings, ...prev })); if (event.language) setDetectedLanguage(event.language); }
      else if (event.type === 'error' || event.type === 'warning') setError(event.message || event.error || 'The teacher could not respond. Please try again.');
    };
    try {
      const response = await fetch(apiBase + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ message: text, history: previous.map(({ role, content }) => ({ role, content })), ...settings, language: languageOverride || settings.language, mode: 'teacher' }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || data.message || 'Connection error (' + response.status + ')'); }
      if (!response.body) throw new Error('Streaming is unavailable in this browser.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let pendingData = '';
      while (true) {
        const { value, done } = await reader.read(); pendingData += decoder.decode(value, { stream: !done });
        const lines = pendingData.split('\n'); pendingData = lines.pop() || '';
        for (const line of lines) if (line.trim()) receive(JSON.parse(line));
        if (done) { if (pendingData.trim()) receive(JSON.parse(pendingData)); break; }
      }
    } catch (err: any) { if (err.name !== 'AbortError' && requestEpoch === epoch.current) setError(err.message || 'Could not connect. Try again.'); }
    finally { if (requestEpoch === epoch.current) { clearTimeout(renderTimer.current); renderTimer.current = undefined; historyRef.current = reply ? [...previous, userTurn, { ...pending, content: reply }] : [...previous, userTurn]; setHistory(historyRef.current); setLoading(false); } }
  };
  const toggleRecording = async () => {
    if (recording) { recorder.current?.stop(); return; } stop(); setError('');
    const permissionEpoch = epoch.current;
    try {
      await resumeAudio();
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone recording is unavailable. Please use the text box.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (permissionEpoch !== epoch.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined); recorder.current = rec;
      const chunks: Blob[] = [], requestEpoch = epoch.current;
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = async () => {
        clearTimeout(recordingTimer.current); media.getTracks().forEach(track => track.stop()); setRecording(false);
        if (requestEpoch !== epoch.current) return; setTranscribing(true);
        const abort = new AbortController(); controller.current = abort;
        try {
          const blob = new Blob(chunks, { type: rec.mimeType }); if (blob.size < 300) throw new Error('That recording was too short. Please try again.');
          const audio = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
          const res = await fetch(apiBase + '/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ audio, mimeType: rec.mimeType, language: settings.language }) });
          const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not understand that audio. Try again.');
          if (requestEpoch !== epoch.current) return;
          const transcript = data.transcript || data.text; if (!transcript?.trim()) throw new Error('I didn’t hear any speech. Please try again.');
          const language = data.language_code || data.language; if (language) setDetectedLanguage(language);
          setTranscribing(false); await chat(transcript, settings.language === 'auto' ? language : settings.language);
        } catch (err: any) { if (err.name !== 'AbortError' && requestEpoch === epoch.current) setError(err.message || 'Could not transcribe audio.'); }
        finally { if (requestEpoch === epoch.current) setTranscribing(false); }
      };
      rec.start(); setRecording(true); recordingTimer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 45000);
    } catch (err: any) { stream.current?.getTracks().forEach(track => track.stop()); setRecording(false); if (permissionEpoch === epoch.current) setError(err.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser, or type your question.' : err.message); }
  };
  useEffect(() => () => { stop(); audioContext.current?.close(); audioContext.current = null; }, [stop]);
  const status = recording ? 'Listening to you' : transcribing ? 'Understanding your question' : speaking ? 'Your teacher is speaking' : loading ? 'Thinking with you' : 'Ready when you are';
  return <ChatContext.Provider value={{ chat, stop, reset, toggleRecording, history, loading, recording, transcribing, speaking, status, error, settings, setSettings, detectedLanguage, timings, analyser, audioBlocked, resumeAudio }}>{children}</ChatContext.Provider>;
}
export function useChat() { const context = useContext(ChatContext); if (!context) throw new Error('ChatProvider is required'); return context; }



