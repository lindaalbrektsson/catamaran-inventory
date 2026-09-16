import 'server-only';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { timed } from './performance';
export async function readTaskUpdates(input: unknown) {
  await requireProfile();
  const { task, occurrence, before } = z
    .object({
      task: z.uuid(),
      occurrence: z.uuid().nullable(),
      before: z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).nullable(),
    })
    .parse(input);
  const db = await supabase();
  let query = db
    .from('task_updates')
    .select('id,body,photo,voice,created_by,created_at')
    .eq('task_id', task)
    .eq('ready', true);
  query = occurrence ? query.eq('occurrence_id', occurrence) : query.is('occurrence_id', null);
  if (before)
    query = query.or(
      `created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`,
    );
  const { data, error } = await timed('updates.page', () =>
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21),
  );
  if (error) throw new Error('UPDATES_LOAD_FAILED');
  return { rows: (data ?? []).slice(0, 20), more: (data?.length ?? 0) > 20 };
}
export type UpdatePage = Awaited<ReturnType<typeof readTaskUpdates>>;
