import { timed } from '@/lib/performance';
import Link from 'next/link';
import type { InventoryItem } from '@/lib/inventory';
import type { Location } from '@/lib/database.types';
import { isLowStock } from '@/lib/domain';
import { dictionary, type Locale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
export async function LowNeedSuggestions({
  items,
  location,
  locale,
}: {
  items: InventoryItem[];
  location: Location;
  locale: Locale;
}) {
  if (!items.length) return null;
  const t = dictionary(locale),
    db = await supabase();
  const ids = [...new Set(items.map((i) => i.product_id))];
  const open = await timed('needs.inventory', async () => {
    const rows = [];
    // Bound URL size; retain pagination, exact product links and all active statuses.
    for (let offset = 0; offset < ids.length; offset += 100) {
      rows.push(
        ...(await collect((a, b) =>
          db
            .from('purchase_needs')
            .select('id,product_id,status')
            .eq('archived', false)
            .in('status', ['PENDING', 'ORDERED'])
            .in('product_id', ids.slice(offset, offset + 100))
            .order('id')
            .range(a, b),
        )),
      );
    }
    return rows;
  });
  const low = items.filter(
    (i) =>
      isLowStock(i.quantity, i.minimum_stock) || open.some((n) => n.product_id === i.product_id),
  );
  if (!low.length) return null;
  return (
    <div className="mb-5 grid gap-3">
      {low.map((i) => {
        const existing = open.find((n) => n.product_id === i.product_id);
        return (
          <div key={i.product_id} className="rounded-xl border bg-secondary p-4">
            <p>
              {i.product.name} · {location.name}
            </p>
            <p>
              {t.quantity}: {Number(i.quantity)} · {t.minimum}: {Number(i.minimum_stock)}
            </p>
            {existing && (
              <p>
                {t.needAlreadyActive} · {existing.status === 'PENDING' ? t.needPending : t.ORDERED}
              </p>
            )}
            <Link
              className="mt-2 inline-flex min-h-12 items-center rounded-xl border bg-card p-3 font-semibold"
              href={existing ? `/needs/${existing.id}` : `/needs/new?product=${i.product_id}`}
            >
              {existing ? t.needOpen : t.addToNeed}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
