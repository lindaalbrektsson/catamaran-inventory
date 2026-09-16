import Link from 'next/link';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { dictionary, type Locale } from '@/lib/i18n';
import type { UpdateFile } from '@/lib/database.types';
import { LocalTime } from './local-time';
import { VoicePlayer } from './voice-recorder';
export async function TaskUpdateHistory({
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
  const db = await supabase(),
    t = dictionary(locale);
  const rows = await collect((a, b) => {
    let q = db.from('task_updates').select('*').eq('task_id', task).eq('ready', true);
    q = occurrence ? q.eq('occurrence_id', occurrence) : q.is('occurrence_id', null);
    return q.order('created_at').order('id').range(a, b);
  });
  return (
    <div className="min-w-0">
      {rows.map((u) => (
        <article key={u.id} className="border-t py-3">
          <p className="mb-2 text-sm">
            {people.find((p) => p.id === u.created_by)?.display_name ?? t.taskPreviousReference} ·{' '}
            <LocalTime value={u.created_at} locale={locale} />
          </p>
          {u.body && <p className="mb-2 whitespace-pre-wrap break-words">{u.body}</p>}
          {u.photo && (
            <Link
              className="inline-flex min-h-12 items-center underline"
              href={'/task-update-file/' + u.id + '/photo'}
            >
              {t.maintenancePhoto}
            </Link>
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
    </div>
  );
}
