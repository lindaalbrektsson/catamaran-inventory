import 'server-only';
import { supabase } from './supabase/server';
import type { Balance, Category, Product } from './database.types';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { cache } from 'react';
export type InventoryItem = Balance & { product: Product; category: Category };
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
}
// Page through PostgREST instead of silently truncating its default row limit.
async function collect<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await read(offset, offset + 499);
    if (result.error || !result.data) throw new Error('DATA_LOAD_FAILED');
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}
const getCatalog = cache(async () => {
  const db = await supabase();
  const [products, categories] = await Promise.all([
    collect((from, to) =>
      db.from('products').select('*').eq('active', true).order('id').range(from, to),
    ),
    collect((from, to) => db.from('categories').select('*').order('id').range(from, to)),
  ]);
  return { products, categories };
});
export async function getLocations() {
  const db = await supabase();
  return collect((from, to) =>
    db.from('locations').select('*').eq('active', true).order('name').range(from, to),
  );
}
export async function getLocation(id: string) {
  validId(id);
  const { data, error } = await (
    await supabase()
  )
    .from('locations')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error('LOCATION_LOAD_FAILED');
  if (!data) notFound();
  return data;
}
export async function getInventory(locationId: string): Promise<InventoryItem[]> {
  validId(locationId);
  const db = await supabase();
  const [balances, { products, categories }] = await Promise.all([
    collect((from, to) =>
      db
        .from('inventory_balances')
        .select('*')
        .eq('location_id', locationId)
        .order('product_id')
        .range(from, to),
    ),
    getCatalog(),
  ]);
  const catalog = new Map(products.map((p) => [p.id, p]));
  const groups = new Map(categories.map((c) => [c.id, c]));
  return balances
    .flatMap((b) => {
      const product = catalog.get(b.product_id);
      const category = product ? groups.get(product.category_id) : undefined;
      return product && category ? [{ ...b, product, category }] : [];
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
}
export async function getItem(locationId: string, productId: string) {
  validId(locationId);
  validId(productId);
  const db = await supabase();
  const [balance, product] = await Promise.all([
    db
      .from('inventory_balances')
      .select('*')
      .eq('location_id', locationId)
      .eq('product_id', productId)
      .maybeSingle(),
    db.from('products').select('*').eq('id', productId).eq('active', true).maybeSingle(),
  ]);
  if (balance.error || product.error) throw new Error('ITEM_LOAD_FAILED');
  if (!balance.data || !product.data) notFound();
  const category = await db
    .from('categories')
    .select('*')
    .eq('id', product.data.category_id)
    .single();
  if (category.error) throw new Error('CATEGORY_LOAD_FAILED');
  return { ...balance.data, product: product.data, category: category.data };
}
export async function getHistory(locationId: string, productId: string, page: number) {
  const db = await supabase();
  const { data, error, count } = await db
    .from('inventory_transactions')
    .select('*', { count: 'exact' })
    .eq('location_id', locationId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error('HISTORY_LOAD_FAILED');
  const ids = [...new Set(data.map((m) => m.performed_by_user_id))];
  const profiles = ids.length
    ? await db.from('profiles').select('id,display_name').in('id', ids)
    : { data: [], error: null };
  if (profiles.error) throw new Error('ACTORS_LOAD_FAILED');
  const names = new Map(profiles.data?.map((p) => [p.id, p.display_name]));
  return {
    movements: data.map((m) => ({
      ...m,
      actor: names.get(m.performed_by_user_id) ?? m.performed_by_user_id,
    })),
    hasNext: (count ?? 0) > page * 20,
  };
}
