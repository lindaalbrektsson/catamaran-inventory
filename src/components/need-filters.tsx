'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dictionary, type Locale } from '@/lib/i18n';
export function NeedFilters({
  locale,
  filters,
  locations,
  products,
}: {
  locale: Locale;
  filters: { status: string; country?: string; location?: string; product?: string };
  locations: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const t = dictionary(locale),
    router = useRouter(),
    [pending, start] = useTransition();
  function change(key: string, value: string) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, [key]: value }))
      if (v !== undefined) query.set(k, v);
    start(() => router.push('/needs?' + query.toString(), { scroll: false }));
  }
  return (
    <fieldset disabled={pending} aria-busy={pending} className="mb-5 grid gap-3">
      <legend className="sr-only">{t.needStatus}</legend>
      <div className="flex flex-wrap gap-2">
        {[
          ['PENDING', t.needPending],
          ['ORDERED', t.ORDERED],
          ['DONE', t.DONE],
          ['', t.needAll],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filters.status === value}
            className="selection-control min-h-12 rounded-xl border bg-background px-3 py-2"
            onClick={() => change('status', value)}
          >
            {label}
          </button>
        ))}
      </div>
      <details open={!!(filters.country || filters.location || filters.product)}>
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-medium">
          {t.uxMoreFilters}
        </summary>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2">
            {t.needCountry}
            <select
              className="selection-control"
              data-active={!!filters.country}
              value={filters.country ?? ''}
              onChange={(e) => change('country', e.target.value)}
            >
              <option value="">{t.needAll}</option>
              <option value="BELIZE">{t.BELIZE}</option>
              <option value="USA">{t.USA}</option>
            </select>
          </label>
          {(['location', 'product'] as const).map((key) => (
            <label key={key} className="hidden gap-2 md:grid">
              {key === 'location' ? t.itemLocation : t.itemName}
              <select
                className="selection-control"
                data-active={!!filters[key]}
                value={filters[key] ?? ''}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">{t.needAll}</option>
                {(key === 'location' ? locations : products).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      {pending && (
        <p role="status" className="text-sm">
          {t.loading}
        </p>
      )}
    </fieldset>
  );
}
