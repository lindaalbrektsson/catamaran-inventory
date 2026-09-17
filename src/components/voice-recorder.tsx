'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import { RECORDING_TYPES, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, voiceTime } from '@/lib/voice-domain';
export type Recording = { file: File; duration: number };
export function VoicePlayer({
  src,
  duration,
  locale,
}: {
  src: string;
  duration: number;
  locale: Locale;
}) {
  const t = dictionary(locale),
    [failed, setFailed] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-sm">
        {t.voiceNote} · {voiceTime(duration)}
      </p>
      <audio
        aria-label={t.voiceNote}
        controls
        preload="none"
        src={src}
        className="h-12 w-full max-w-sm"
        onError={() => setFailed(true)}
      />
      {failed && <p role="alert">{t.voicePlaybackError}</p>}
    </div>
  );
}
export function VoiceRecorder({
  value,
  onChange,
  onBusy,
  locale,
}: {
  value: Recording | null;
  onChange: (value: Recording | null) => void;
  onBusy: (busy: boolean) => void;
  locale: Locale;
}) {
  const t = dictionary(locale),
    [phase, setPhase] = useState<'idle' | 'ready' | 'requesting' | 'recording'>('idle'),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState<Key | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        if (recorder.current.state !== 'inactive') recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        if (recorder.current?.state === 'recording') recorder.current.stop();
        stream.current?.getTracks().forEach((t) => t.stop());
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('voiceUnsupported');
      return;
    }
    const mime = RECORDING_TYPES.find((x) => MediaRecorder.isTypeSupported(x));
    if (!mime) {
      setError('voiceUnsupported');
      return;
    }
    setPhase('requesting');
    onBusy(true);
    onChange(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || document.hidden) {
        s.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setPhase('ready');
          onBusy(false);
        }
        return;
      }
      stream.current = s;
      const r = new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 64000 });
      recorder.current = r;
      let chunks: Blob[] = [],
        size = 0,
        tooBig = false,
        broken = false;
      const began = performance.now();
      r.ondataavailable = (e) => {
        if (e.data.size) {
          size += e.data.size;
          if (size > VOICE_MAX_BYTES) {
            tooBig = true;
            chunks = [];
            stop();
          } else if (!tooBig) chunks.push(e.data);
        }
      };
      r.onerror = () => {
        broken = true;
        stop();
        if (alive.current) {
          setError('voiceFailed');
          setPhase('ready');
          onBusy(false);
        }
      };
      r.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop());
        if (!alive.current) return;
        setPhase('ready');
        onBusy(false);
        const duration = Math.min(VOICE_MAX_SECONDS, (performance.now() - began) / 1000);
        if (tooBig) {
          setError('voiceSize');
          return;
        }
        if (broken || !chunks.length) {
          setError('voiceFailed');
          return;
        }
        const actual = r.mimeType || chunks[0].type || mime;
        onChange({
          file: new File(chunks, 'recording', { type: actual }),
          duration: Math.max(0.01, duration),
        });
      };
      r.start(250);
      setPhase('recording');
      setSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = (performance.now() - began) / 1000;
        setSeconds(elapsed);
        if (elapsed >= VOICE_MAX_SECONDS - 1) {
          setError('voiceLimit');
          stop();
        }
      }, 200);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (!alive.current) return;
      setPhase('ready');
      onBusy(false);
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError' ? 'voiceDenied' : 'voiceFailed',
      );
    }
  }
  const cls = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2';
  return (
    <div className="grid min-w-0 gap-2">
      {phase === 'idle' && !value ? (
        <button type="button" className={cls} onClick={() => setPhase('ready')}>
          <Mic size={18} />
          {t.voiceRecord}
        </button>
      ) : phase === 'recording' ? (
        <>
          <div
            className={`rounded-xl border p-3 ${seconds >= VOICE_MAX_SECONDS - 30 ? 'border-warning bg-warning-soft text-warning' : 'bg-muted'}`}
          >
            <p role="status" className="font-semibold">
              {t.voiceRecording} ·{' '}
              <span
                role="timer"
                aria-live="off"
                aria-label={t.voiceElapsed}
                className="tabular-nums"
              >
                {voiceTime(seconds).padStart(5, '0')} /{' '}
                {voiceTime(VOICE_MAX_SECONDS).padStart(5, '0')}
              </span>
            </p>
            {seconds >= VOICE_MAX_SECONDS - 30 && (
              <p className="mt-1 text-sm">{t.voiceNearLimit}</p>
            )}
          </div>
          <button type="button" className={cls} onClick={stop}>
            <Square size={18} />
            {t.voiceStop}
          </button>
        </>
      ) : phase === 'requesting' ? (
        <p role="status">{t.voiceRecord}…</p>
      ) : (
        <>
          {value && (
            <RecordingPreview key={value.file.lastModified} value={value} locale={locale} />
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cls} onClick={start}>
              <Mic size={18} />
              {value ? t.voiceAgain : t.voiceStart}
            </button>
            {value && (
              <button
                type="button"
                className={cls}
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
              >
                <Trash2 size={18} />
                {t.voiceRemove}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert">{t[error]}</p>}
    </div>
  );
}

function RecordingPreview({ value, locale }: { value: Recording; locale: Locale }) {
  const [url] = useState(() => URL.createObjectURL(value.file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <VoicePlayer src={url} duration={value.duration} locale={locale} />;
}
