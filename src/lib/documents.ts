import 'server-only';
import { supabase } from './supabase/server';
import { collect } from './inventory';
export async function getDocuments() {
  const db = await supabase();
  return collect((a, b) => db.from('documents').select('*').order('title').order('id').range(a, b));
}
export async function documentPeople() {
  const { data, error } = await (await supabase()).rpc('document_people');
  if (error) throw new Error('DOCUMENT_PEOPLE_FAILED');
  return data ?? [];
}
