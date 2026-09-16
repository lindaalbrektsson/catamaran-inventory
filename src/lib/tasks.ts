import 'server-only';
import { supabase } from './supabase/server';
import { collect } from './inventory';
export async function getTasks() {
  const db = await supabase();
  return collect((a, b) =>
    db.from('tasks').select('*').order('updated_at', { ascending: false }).order('id').range(a, b),
  );
}
export async function taskSummary() {
  const db = await supabase();
  const [people, types, tasks, maintenance] = await Promise.all([
    db.rpc('task_people'),
    collect((a, b) => db.from('task_types').select('*').order('code').range(a, b)),
    getTasks(),
    collect((a, b) => db.from('maintenance_rules').select('task_id').order('task_id').range(a, b)),
  ]);
  if (people.error) throw new Error('TASK_PEOPLE_LOAD_FAILED');
  const planned = new Set(maintenance.map((x) => x.task_id));
  return { people: people.data ?? [], types, tasks: tasks.filter((x) => !planned.has(x.id)) };
}
export async function taskCatalog() {
  const db = await supabase();
  const [people, types, products, needs, receipts, locations, tasks, reminderPeople] =
    await Promise.all([
      db.rpc('task_people'),
      collect((a, b) => db.from('task_types').select('*').order('code').range(a, b)),
      collect((a, b) =>
        db.from('products').select('id,name').eq('active', true).order('id').range(a, b),
      ),
      collect((a, b) =>
        db.from('purchase_needs').select('id,name').eq('archived', false).order('id').range(a, b),
      ),
      collect((a, b) =>
        db
          .from('receipt_intake')
          .select('id,receipt_type,created_at')
          .eq('upload_ready', true)
          .order('id')
          .range(a, b),
      ),
      collect((a, b) =>
        db.from('locations').select('id,name').eq('active', true).order('id').range(a, b),
      ),
      getTasks(),
      db.rpc('reminder_people'),
    ]);
  if (people.error || reminderPeople.error) throw new Error('TASK_PEOPLE_LOAD_FAILED');
  return {
    reminderPeople: reminderPeople.data ?? [],
    people: people.data ?? [],
    types,
    products,
    needs,
    receipts,
    locations,
    tasks,
  };
}
export type TaskCatalog = Awaited<ReturnType<typeof taskCatalog>>;
