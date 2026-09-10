import { getProfile, getLocale } from '@/lib/auth';
import { itemCatalog } from '@/lib/item-catalog';
import { itemWorkbook } from '@/lib/item-excel';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!profile?.active || profile.role !== 'OWNER') return new Response(null, { status: 403 });
  const catalog = await itemCatalog(),
    locale = await getLocale(),
    exporting = new URL(request.url).searchParams.has('export');
  let rows: unknown[][] | undefined;
  if (exporting) {
    const db = await supabase();
    const balances = await collect((a, b) =>
      db
        .from('inventory_balances')
        .select('*')
        .order('product_id')
        .order('location_id')
        .range(a, b),
    );
    rows = balances.flatMap((b) => {
      const p = catalog.products.find((p) => p.id === b.product_id),
        l = catalog.locations.find((l) => l.id === b.location_id);
      if (!p || !l) return [];
      const c = catalog.categories.find((c) => c.id === p.category_id);
      return [
        [
          p.name,
          c ? (locale === 'es' ? c.name_es : c.name_en) : '',
          p.unit,
          l.name,
          b.minimum_stock,
          b.target_stock,
          p.estimated_unit_cost,
          p.cost_currency,
          b.quantity,
          p.description,
        ],
      ];
    });
  }
  return new Response(new Uint8Array(await itemWorkbook(catalog, locale, rows)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventory-${exporting ? 'export' : 'template'}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
