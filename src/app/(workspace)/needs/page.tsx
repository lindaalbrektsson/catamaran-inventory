import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { NeedProgress } from '@/components/need-progress';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { compactDate } from '@/lib/list-presentation';
import { NeedFilters } from '@/components/need-filters';
export default async function Needs({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; status?: string; location?: string; product?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    raw = await searchParams,
    q = { ...raw, status: raw.status ?? 'PENDING' },
    db = await supabase(),
    catalog = await itemCatalog();
  const needs = await collect((a, b) => {
    let query = db
      .from('purchase_needs')
      .select('*')
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .order('id');
    if (['BELIZE', 'USA'].includes(q.country ?? ''))
      query = query.eq('country', q.country as 'BELIZE' | 'USA');
    if (['PENDING', 'ORDERED', 'DONE'].includes(q.status ?? ''))
      query = query.eq('status', q.status as 'PENDING' | 'ORDERED' | 'DONE');
    if (catalog.locations.some((l) => l.id === q.location))
      query = query.eq('location_id', q.location!);
    if (catalog.products.some((l) => l.id === q.product))
      query = query.eq('product_id', q.product!);
    return query.range(a, b);
  });
  return (
    <div className="page">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.needsTitle}</h1>
        <Link
          href="/needs/new"
          className="min-h-12 rounded-xl bg-primary p-3 text-primary-foreground"
        >
          {t.needNew}
        </Link>
      </div>
      <NeedFilters
        locale={locale}
        filters={q}
        locations={catalog.locations.map(({ id, name }) => ({ id, name }))}
        products={catalog.products.map(({ id, name }) => ({ id, name }))}
      />
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {needs.map((n) => (
          <article key={n.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Link href={`/needs/${n.id}`} className="block min-h-11 min-w-0 flex-1">
              <h2 className="break-words font-semibold leading-snug">
                {catalog.products.find((p) => p.id === n.product_id)?.name ?? n.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t[n.country]} ·{' '}
                <StatusBadge
                  tone={
                    n.status === 'DONE'
                      ? 'positive'
                      : n.status === 'ORDERED'
                        ? 'active'
                        : 'attention'
                  }
                >
                  {n.status === 'PENDING' ? t.needPending : t[n.status]}
                </StatusBadge>
                {n.location_id && catalog.locations.find((l) => l.id === n.location_id) && (
                  <> · {catalog.locations.find((l) => l.id === n.location_id)?.name}</>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <time dateTime={n.created_at}>{compactDate(n.created_at, locale)}</time>
              </p>
            </Link>
            <NeedProgress
              key={n.version}
              id={n.id}
              version={n.version}
              status={n.status}
              locale={locale}
            />
          </article>
        ))}
      </div>
      {!needs.length && <EmptyState domain="need" title={t.needEmpty} />}
    </div>
  );
}
