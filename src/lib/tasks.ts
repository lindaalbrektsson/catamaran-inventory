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
  const [people, types, tasks] = await Promise.all([
    db.rpc('task_people'),
    collect((a, b) => db.from('task_types').select('*').order('code').range(a, b)),
    getTasks(),
  ]);
  if (people.error) throw new Error('TASK_PEOPLE_LOAD_FAILED');
  return { people: people.data ?? [], types, tasks };
}
export async function taskCatalog() {
  const db = await supabase();
  const [people, types, products, needs, receipts, locations, tasks] = await Promise.all([
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
  ]);
  if (people.error) throw new Error('TASK_PEOPLE_LOAD_FAILED');
  return { people: people.data ?? [], types, products, needs, receipts, locations, tasks };
}
export type TaskCatalog = Awaited<ReturnType<typeof taskCatalog>>;
