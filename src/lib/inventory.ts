import 'server-only';
import { supabase } from './supabase/server';
import type { Balance, Category, Product, Location } from './database.types';
import { isLowStock, type MovementType } from './domain';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { cache } from 'react';
export type InventoryItem = Balance & { product: Product; category: Category };
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
}
// Page through PostgREST instead of silently truncating its default row limit.
export async function collect<T>(
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
export const getInventory = cache(async (locationId: string): Promise<InventoryItem[]> => {
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
});

export type LocationSummary = Location & {
  activeItems: number;
  lowStockCount: number;
  latestMovement: { created_at: string; transaction_type: MovementType } | null;
};
export async function getLocationSummaries(): Promise<LocationSummary[]> {
  const db = await supabase();
  const locations = await getLocations();
  return Promise.all(
    locations.map(async (location) => {
      const [items, latest] = await Promise.all([
        getInventory(location.id),
        db
          .from('inventory_transactions')
          .select('created_at,transaction_type')
          .eq('location_id', location.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (latest.error) throw new Error('LOCATION_ACTIVITY_LOAD_FAILED');
      return {
        ...location,
        activeItems: items.length,
        lowStockCount: items.filter((item) => isLowStock(item.quantity, item.minimum_stock)).length,
        latestMovement: latest.data,
      };
    }),
  );
}

export async function getTransferDestinations(productId: string, sourceId: string) {
  validId(productId);
  validId(sourceId);
  const db = await supabase();
  const [locations, balances] = await Promise.all([
    getLocations(),
    collect((from, to) =>
      db
        .from('inventory_balances')
        .select('*')
        .eq('product_id', productId)
        .order('location_id')
        .range(from, to),
    ),
  ]);
  const configured = new Set(balances.map((balance) => balance.location_id));
  return locations.filter((location) => location.id !== sourceId && configured.has(location.id));
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
  const relatedIds = [
    ...new Set(data.flatMap((m) => (m.related_location_id ? [m.related_location_id] : []))),
  ];
  const related = relatedIds.length
    ? await db.from('locations').select('id,name').in('id', relatedIds)
    : { data: [], error: null };
  if (related.error) throw new Error('RELATED_LOCATIONS_LOAD_FAILED');
  const locationNames = new Map(related.data?.map((location) => [location.id, location.name]));
  return {
    movements: data.map((m) => ({
      ...m,
      actor: names.get(m.performed_by_user_id) ?? m.performed_by_user_id,
      relatedLocation: m.related_location_id ? locationNames.get(m.related_location_id) : undefined,
    })),
    hasNext: (count ?? 0) > page * 20,
  };
}
