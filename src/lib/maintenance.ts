import 'server-only';
import { supabase } from './supabase/server';
import { collect } from './inventory';
import { timed } from './performance';
export function belizeClock(now = new Date()) {
  return {
    clock: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Belize',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(now),
    today: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Belize',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  };
}
export async function maintenanceCatalog(taskId?: string) {
  const db = await supabase(),
    now = new Date();
  const [tasks, rules, occurrences, people] = await timed('maintenance.catalog', () =>
    Promise.all([
      collect((a, b) =>
        (taskId
          ? db.from('tasks').select('*').eq('id', taskId)
          : db.from('tasks').select('*').eq('type_code', 'MAINTENANCE').eq('archived', false)
        )
          .order('id')
          .range(a, b),
      ),
      collect((a, b) =>
        (taskId
          ? db.from('maintenance_rules').select('*').eq('task_id', taskId)
          : db.from('maintenance_rules').select('*')
        )
          .order('task_id')
          .range(a, b),
      ),
      collect((a, b) =>
        (taskId
          ? db
              .from('maintenance_occurrences')
              .select('*')
              .eq('task_id', taskId)
              .neq('status', 'DONE')
          : db.from('maintenance_occurrences').select('*').neq('status', 'DONE')
        )
          .order('created_at')
          .order('id')
          .range(a, b),
      ),
      db.rpc('maintenance_people'),
    ]),
  );
  if (people.error) throw new Error('MAINTENANCE_LOAD_FAILED');
  return {
    tasks,
    rules,
    occurrences,
    people: people.data ?? [],
    ...belizeClock(now),
  };
}
export type MaintenanceCatalog = Awaited<ReturnType<typeof maintenanceCatalog>>;
