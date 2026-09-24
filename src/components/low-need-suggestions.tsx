import { timed } from '@/lib/performance';
import Link from 'next/link';
import type { InventoryItem } from '@/lib/inventory';
import type { Location } from '@/lib/database.types';
import {
  activeNeedForLocation,
  needsShoppingPrompt,
  suggestedNeedQuantity,
} from '@/lib/need-matching';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
export async function LowNeedSuggestions({
  items,
  location,
  locale,
  expanded = false,
}: {
  items: InventoryItem[];
  location: Location;
  locale: Locale;
  expanded?: boolean;
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
            .select('id,product_id,location_id,status')
            .eq('archived', false)
            .or(`location_id.eq.${location.id},location_id.is.null`)
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
      needsShoppingPrompt(i.quantity, i.minimum_stock) ||
      activeNeedForLocation({ needs: open }, i.product_id, location.id),
  );
  if (!low.length) return null;
  const content = (
    <div className="mb-3">
      <div className="grid gap-2">
        {low.map((i) => {
          const existing = activeNeedForLocation({ needs: open }, i.product_id, location.id);
          const suggestion = suggestedNeedQuantity(
            { categories: [], products: [], locations: [location], balances: [i] },
            i.product_id,
            location.id,
          );
          return (
            <div key={i.product_id} className="rounded-xl border p-3">
              <p>
                {i.product.name} · {location.name}
              </p>
              <p>
                {t.quantity}: {Number(i.quantity)} · {t.minimum}: {Number(i.minimum_stock)}
              </p>
              {!existing && suggestion !== null && (
                <p className="mt-2 text-sm">
                  {t.shoppingSuggestion
                    .replace('{quantity}', number(suggestion, locale))
                    .replace('{unit}', t[i.product.unit])}
                </p>
              )}
              {existing && (
                <p>
                  {t.needAlreadyActive} ·{' '}
                  {existing.status === 'PENDING' ? t.needPending : t.ORDERED}
                </p>
              )}
              <Link
                className="mt-2 inline-flex min-h-12 items-center rounded-xl border bg-card p-3 font-semibold"
                href={
                  existing
                    ? `/needs/${existing.id}`
                    : `/needs/new?product=${i.product_id}&location=${location.id}`
                }
              >
                {existing ? t.needOpen : t.addToNeed}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
  return expanded ? (
    content
  ) : (
    <details className="mb-3 rounded-xl border px-3">
      <summary className="min-h-12 cursor-pointer py-3 font-medium">
        {t.needsTitle} · {low.length}
      </summary>
      {content}
    </details>
  );
}
