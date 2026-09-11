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
  const low = items.filter((i) => isLowStock(i.quantity, i.minimum_stock));
  if (!low.length) return null;
  const t = dictionary(locale),
    db = await supabase();
  const open = await collect((a, b) =>
    db
      .from('purchase_needs')
      .select('id,product_id')
      .eq('location_id', location.id)
      .eq('archived', false)
      .in('status', ['PENDING', 'ORDERED'])
      .order('id')
      .range(a, b),
  );
  return (
    <div className="mb-5 grid gap-3">
      {low.map((i) => {
        const existing = open.find((n) => n.product_id === i.product_id);
        return (
          <div key={i.product_id} className="rounded-xl border bg-secondary p-4">
            <p>
              {t.lowNeedHint.replace('{item}', i.product.name).replace('{location}', location.name)}
            </p>
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
  );
}
