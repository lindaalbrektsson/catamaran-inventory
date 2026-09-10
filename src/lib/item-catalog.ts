import 'server-only';
import { supabase } from './supabase/server';
import { collect } from './inventory';
export async function itemCatalog() {
  const db = await supabase();
  const [categories, locations, products] = await Promise.all([
    collect((a, b) => db.from('categories').select('*').eq('active', true).order('id').range(a, b)),
    collect((a, b) => db.from('locations').select('*').eq('active', true).order('id').range(a, b)),
    collect((a, b) => db.from('products').select('*').order('id').range(a, b)),
  ]);
  return { categories, locations, products };
}
