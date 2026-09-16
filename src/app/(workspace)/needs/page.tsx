import { NeedProgress } from '@/components/need-progress';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { LocalTime } from '@/components/local-time';
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
  const control = 'min-h-12 rounded-xl border bg-background p-3';
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
      <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-2">
          {t.needCountry}
          <select className={control} name="country" defaultValue={q.country ?? ''}>
            <option value="">{t.needAll}</option>
            <option value="BELIZE">{t.BELIZE}</option>
            <option value="USA">{t.USA}</option>
          </select>
        </label>
        <label className="grid gap-2">
          {t.needStatus}
          <select className={control} name="status" defaultValue={q.status ?? ''}>
            <option value="">{t.needAll}</option>
            <option value="PENDING">{t.needPending}</option>
            <option value="ORDERED">{t.ORDERED}</option>
            <option value="DONE">{t.DONE}</option>
          </select>
        </label>
        <label className="hidden gap-2 md:grid">
          {t.itemLocation}
          <select className={control} name="location" defaultValue={q.location ?? ''}>
            <option value="">{t.needAll}</option>
            {catalog.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="hidden gap-2 md:grid">
          {t.itemName}
          <select className={control} name="product" defaultValue={q.product ?? ''}>
            <option value="">{t.needAll}</option>
            {catalog.products.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button className={`${control} self-end`}>{t.applyFilters}</button>
      </form>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {needs.map((n) => (
          <article key={n.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Link href={`/needs/${n.id}`} className="block min-h-11 min-w-0 flex-1">
              <h2 className="break-words font-semibold leading-snug">
                {catalog.products.find((p) => p.id === n.product_id)?.name ?? n.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t[n.country]} · {n.status === 'PENDING' ? t.needPending : t[n.status]}
                {n.location_id && catalog.locations.find((l) => l.id === n.location_id) && (
                  <> · {catalog.locations.find((l) => l.id === n.location_id)?.name}</>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <LocalTime value={n.created_at} locale={locale} />
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
      {!needs.length && <p>{t.needEmpty}</p>}
    </div>
  );
}
