import 'server-only';
import { notFound } from 'next/navigation';
import { supabase } from './supabase/server';
import { collect, getLocations, validId } from './inventory';
import type { SpendingKind } from './spending-domain';

export async function getSpendingOptions() {
  const db = await supabase();
  const available = await db.from('expense_categories').select('id').limit(0);
  if (available.error?.code === 'PGRST205' || available.error?.code === '42P01') return null;
  if (available.error) throw new Error('SPENDING_OPTIONS_FAILED');
  const [locations, categories, people] = await Promise.all([
    getLocations(),
    collect((from, to) =>
      db.from('expense_categories').select('*').eq('active', true).order('name_en').range(from, to),
    ),
    collect((from, to) =>
      db.from('profiles').select('id,display_name').eq('active', true).order('id').range(from, to),
    ),
  ]);
  return { locations, categories, people };
}
export function readSpendingKind(value?: string): SpendingKind {
  return value === 'purchase' ? 'PURCHASE' : 'EXPENSE';
}
export async function getSpendingList(kind: SpendingKind, page: number) {
  const db = await supabase();
  const result = await db
    .from(kind === 'EXPENSE' ? 'expenses' : 'purchases')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .order('id')
    .range((page - 1) * 20, page * 20 - 1);
  // Fresh installations show an honest setup state until the additive migration is applied.
  if (result.error?.code === 'PGRST205' || result.error?.code === '42P01') return null;
  if (result.error) throw new Error('SPENDING_LOAD_FAILED');
  const [categories, locations] = result.data.length
    ? await Promise.all([
        db
          .from('expense_categories')
          .select('*')
          .in('id', [...new Set(result.data.map((row) => row.category_id))]),
        db
          .from('locations')
          .select('id,name')
          .in('id', [...new Set(result.data.map((row) => row.location_id))]),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (categories.error || locations.error) throw new Error('SPENDING_LABELS_FAILED');
  return {
    rows: result.data.map((row) => ({
      ...row,
      category: categories.data?.find((category) => category.id === row.category_id),
      location: locations.data?.find((location) => location.id === row.location_id)?.name,
    })),
    hasNext: (result.count ?? 0) > page * 20,
  };
}
export async function getSpendingDetail(id: string, kind: SpendingKind) {
  validId(id);
  const db = await supabase();
  const result = await db
    .from(kind === 'EXPENSE' ? 'expenses' : 'purchases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (result.error) throw new Error('SPENDING_LOAD_FAILED');
  if (!result.data) notFound();
  const record = result.data;
  const [category, location, payer, receipts] = await Promise.all([
    db.from('expense_categories').select('*').eq('id', record.category_id).single(),
    db.from('locations').select('name').eq('id', record.location_id).single(),
    db.from('profiles').select('display_name').eq('id', record.paid_by).single(),
    db
      .from('receipts')
      .select('*')
      .eq(kind === 'EXPENSE' ? 'expense_id' : 'purchase_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (category.error || location.error || payer.error || receipts.error)
    throw new Error('SPENDING_DETAIL_FAILED');
  return {
    record,
    category: category.data,
    location: location.data.name,
    payer: payer.data.display_name,
    receipts: receipts.data,
  };
}
