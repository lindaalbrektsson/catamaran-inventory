import { DesktopOnly } from '@/components/desktop-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { getLocations, getInventory, collect } from '@/lib/inventory';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { OwnerInventory } from '@/components/owner-inventory';
import { InventoryAdminActions } from '@/components/inventory-admin-actions';
export default async function Overview() {
  const p = await requireProfile();
  if (p.role !== 'OWNER') redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase(),
    locations = await getLocations();
  const [groups, movements, profiles, products] = await Promise.all([
    Promise.all(locations.map((l) => getInventory(l.id, true))),
    collect((a, b) =>
      db
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b),
    ),
    collect((a, b) => db.from('profiles').select('id,display_name').order('id').range(a, b)),
    collect((a, b) => db.from('products').select('id,name').order('id').range(a, b)),
  ]);
  const names = new Map(profiles.map((p) => [p.id, p.display_name])),
    productNames = new Map(products.map((p) => [p.id, p.name]));
  return (
    <DesktopOnly locale={locale}>
      <div className="page">
        <h1 className="mb-5 text-2xl font-semibold">{t.ownerWorkspace}</h1>
        <InventoryAdminActions role={p.role} locale={locale} />
        <Link
          href="/expenses?status=NEW"
          className="mb-6 inline-flex rounded-xl bg-primary p-4 text-primary-foreground"
        >
          {t.receipts} · {t.needsReview}
        </Link>
        <OwnerInventory
          items={groups.flat()}
          locations={locations}
          locale={locale}
          movements={movements.map((m) => ({
            ...m,
            actor: names.get(m.performed_by_user_id) ?? m.performed_by_user_id,
            productName: productNames.get(m.product_id) ?? m.product_id,
            locationName: locations.find((l) => l.id === m.location_id)?.name ?? m.location_id,
          }))}
        />
      </div>
    </DesktopOnly>
  );
}
