import 'server-only';
import { supabase } from './supabase/server';
import { collect } from './inventory';
export async function maintenanceCatalog() {
  const db = await supabase(),
    now = new Date();
  const [tasks, rules, occurrences, people] = await Promise.all([
    collect((a, b) =>
      db.from('tasks').select('*').eq('type_code', 'MAINTENANCE').order('id').range(a, b),
    ),
    collect((a, b) => db.from('maintenance_rules').select('*').order('task_id').range(a, b)),
    collect((a, b) =>
      db.from('maintenance_occurrences').select('*').order('created_at').order('id').range(a, b),
    ),
    db.rpc('maintenance_people'),
  ]);
  if (people.error) throw new Error('MAINTENANCE_LOAD_FAILED');
  return {
    tasks,
    rules,
    occurrences,
    people: people.data ?? [],
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
export type MaintenanceCatalog = Awaited<ReturnType<typeof maintenanceCatalog>>;
