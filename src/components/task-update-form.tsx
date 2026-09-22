'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { addTaskUpdate } from '@/lib/task-update-upload';
import { MediaPicker } from './media-picker';
import { VoiceRecorder, type Recording } from './voice-recorder';
export function TaskUpdateForm({
  task = '',
  occurrence = '',
  locale,
}: {
  task?: string;
  occurrence?: string;
  locale: Locale;
}) {
  const t = dictionary(locale),
    ref = useRef<HTMLFormElement>(null),
    [photo, setPhoto] = useState<File | null>(null),
    [body, setBody] = useState(''),
    [voice, setVoice] = useState<Recording | null>(null),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [id, setId] = useState(() => crypto.randomUUID()),
    [reset, setReset] = useState(0);
  const [state, action, pending] = useActionState(
    async (
      _: { error?: keyof typeof t; saved?: boolean },
      form: FormData,
    ): Promise<{ error?: keyof typeof t; saved?: boolean }> => {
      if (busy) return { error: 'voiceFailed' };
      if (photo) form.set('photo', photo);
      if (voice) {
        form.set('voice', voice.file);
        form.set('duration', String(voice.duration));
      }
      const r = await addTaskUpdate({}, form);
      if (!r.error) {
        ref.current?.reset();
        setPhoto(null);
        setBody('');
        setVoice(null);
        setReset((x) => x + 1);
        setId(crypto.randomUUID());
        return { saved: true };
      }
      return r;
    },
    {},
  );
  useEffect(() => {
    if (!voice && !photo && !body && !busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [voice, photo, body, busy]);
  const cls = 'min-h-12 rounded-xl border bg-background p-3';
  return (
    <form
      ref={ref}
      action={action}
      onChange={() => setId(crypto.randomUUID())}
      className="grid min-w-0 gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="task" value={task} />
      <input type="hidden" name="occurrence" value={occurrence} />
      <fieldset disabled={pending} className="contents">
        <label className="grid gap-2">
          {t.maintenanceUpdateText}
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            className={cls}
          />
        </label>
        <MediaPicker
          locale={locale}
          value={photo}
          onChange={(value) => {
            setPhoto(value);
            setId(crypto.randomUUID());
          }}
          profile="update"
          disabled={pending}
          onBusy={setPhotoBusy}
        />
        <VoiceRecorder
          key={reset}
          value={voice}
          onChange={(v) => {
            setVoice(v);
            setId(crypto.randomUUID());
          }}
          onBusy={(value) => {
            setBusy(value);
            if (value) ref.current?.dispatchEvent(new Event('input', { bubbles: true }));
          }}
          locale={locale}
        />
        {state.error && <p role="alert">{t[state.error]}</p>}
        {state.saved && <p role="status">{t.maintenanceSaved}</p>}
        <button
          disabled={busy || photoBusy}
          className="min-h-12 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
        >
          {pending ? t.saving : t.maintenanceUpdate}
        </button>
      </fieldset>
    </form>
  );
}
