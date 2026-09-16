'use client';
import { useState, useRef } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import type { UpdateFile } from '@/lib/database.types';
import type { UpdatePage } from '@/lib/task-update-history';
import { LocalTime } from './local-time';
import { VoicePlayer } from './voice-recorder';
export function TaskUpdateHistory({
  task,
  occurrence = null,
  locale,
  people,
}: {
  task: string;
  occurrence?: string | null;
  locale: Locale;
  people: { id: string; display_name: string }[];
}) {
  const t = dictionary(locale);
  const [page, setPage] = useState<UpdatePage | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const flight = useRef(false);
  async function load() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(false);
    try {
      const q = new URLSearchParams({ task });
      if (occurrence) q.set('occurrence', occurrence);
      const last = page?.rows.at(-1);
      if (last) {
        q.set('before', last.created_at);
        q.set('id', last.id);
      }
      const response = await fetch('/api/task-updates?' + q, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('LOAD_FAILED');
      const next: UpdatePage = await response.json();
      setPage({ rows: [...(page?.rows ?? []), ...next.rows], more: next.more });
    } catch {
      setError(true);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="min-w-0"
      onToggle={(e) => {
        if (e.currentTarget.open && !page) void load();
      }}
    >
      <summary className="min-h-12 cursor-pointer py-3">{t.updatesTitle}</summary>
      {page?.rows.map((u) => (
        <article key={u.id} className="border-t py-3">
          <p className="mb-2 text-sm">
            {people.find((p) => p.id === u.created_by)?.display_name ?? t.taskPreviousReference} ·{' '}
            <LocalTime value={u.created_at} locale={locale} />
          </p>
          {u.body && <p className="mb-2 whitespace-pre-wrap break-words">{u.body}</p>}
          {u.photo && (
            <a
              className="inline-flex min-h-12 items-center underline"
              href={'/task-update-file/' + u.id + '/photo'}
            >
              {t.maintenancePhoto}
            </a>
          )}
          {u.voice && (
            <VoicePlayer
              src={'/task-update-file/' + u.id + '/voice'}
              duration={(u.voice as UpdateFile).duration ?? 0}
              locale={locale}
            />
          )}
        </article>
      ))}
      {busy && <p role="status">{t.loading}</p>}
      {error && <p role="alert">{t.updatesLoadFailed}</p>}
      {!busy && (error || page?.more) && (
        <button
          type="button"
          className="min-h-12 rounded-xl border px-3"
          onClick={() => void load()}
        >
          {error ? t.retry : t.updatesMore}
        </button>
      )}
    </details>
  );
}
