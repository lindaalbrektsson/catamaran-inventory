import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { getItem, collect } from '@/lib/inventory';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { ItemChangeHistory, type ItemChange } from '@/components/item-change-history';
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string; productId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(profile.role)) redirect('/inventory');
  const { locationId, productId } = await params,
    search = await searchParams;
  const page = /^[1-9]\d{0,3}$/.test(search.page ?? '') ? Number(search.page) : 1;
  const item = await getItem(locationId, productId, true),
    locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const { data, error } = await db.rpc('item_change_history', { p_id: productId, p_page: page });
  if (error) throw new Error('ITEM_HISTORY_LOAD_FAILED');
  const events = data as unknown as ItemChange[];
  const categories = await collect((a, b) =>
    db.from('categories').select('*').order('id').range(a, b),
  );
  const base = `/inventory/${locationId}/${productId}`;
  return (
    <div className="page">
      <PageHeader
        title={t.itemChanges}
        description={item.product.name}
        back={base}
        locale={locale}
      />
      <ItemChangeHistory events={events.slice(0, 20)} categories={categories} locale={locale} />
      <div className="mt-4 flex gap-4">
        {page > 1 && (
          <Link
            className="min-h-12 p-3 underline"
            href={`${base}/settings-history?page=${page - 1}`}
          >
            {t.previous}
          </Link>
        )}
        {events.length > 20 && (
          <Link
            className="min-h-12 p-3 underline"
            href={`${base}/settings-history?page=${page + 1}`}
          >
            {t.next}
          </Link>
        )}
      </div>
    </div>
  );
}
