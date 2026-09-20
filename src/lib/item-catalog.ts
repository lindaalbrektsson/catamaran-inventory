import { locationOrder } from './location-order';
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
  return { categories, locations: locationOrder(locations), products };
}
export async function needCatalog() {
  const db = await supabase();
  const [catalog, balances, needs] = await Promise.all([
    itemCatalog(),
    collect((a, b) =>
      db
        .from('inventory_balances')
        .select('*')
        .order('location_id')
        .order('product_id')
        .range(a, b),
    ),
    collect((a, b) =>
      db
        .from('purchase_needs')
        .select('id,product_id,status')
        .eq('archived', false)
        .in('status', ['PENDING', 'ORDERED'])
        .order('id')
        .range(a, b),
    ),
  ]);
  return { ...catalog, balances, needs };
}
