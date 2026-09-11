'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { InventoryItem } from '@/lib/inventory';
import type { Location, Movement } from '@/lib/database.types';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { LocalTime } from './local-time';
export type OwnerMovement = Movement & { actor: string; productName: string; locationName: string };
export function OwnerInventory({
  items,
  locations,
  movements,
  locale,
}: {
  items: InventoryItem[];
  locations: Location[];
  movements: OwnerMovement[];
  locale: Locale;
}) {
  const t = dictionary(locale),
    [query, setQuery] = useState(''),
    [location, setLocation] = useState(''),
    [category, setCategory] = useState(''),
    [historyQuery, setHistoryQuery] = useState(''),
    [limit, setLimit] = useState(50);
  const categories = [...new Map(items.map((i) => [i.category.id, i.category])).values()];
  const filtered = items.filter(
    (i) =>
      (!location || i.location_id === location) &&
      (!category || i.category.id === category) &&
      i.product.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)),
  );
  const history = movements.filter(
    (m) =>
      (!location || m.location_id === location) &&
      (!category ||
        items.some((i) => i.product_id === m.product_id && i.category.id === category)) &&
      `${m.productName} ${m.actor} ${t[m.transaction_type]} ${m.created_at}`
        .toLocaleLowerCase(locale)
        .includes(historyQuery.toLocaleLowerCase(locale)),
  );
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-3">
        <label>
          {t.search}
          <input
            type="search"
            className="mt-1 min-h-12 w-full rounded-xl border bg-background px-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          {t.itemLocation}
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">{t.allLocations}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.category}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'es' ? c.name_es : c.name_en}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                t.itemName,
                t.itemLocation,
                t.quantity,
                t.itemUnit,
                t.itemMinimum,
                t.itemTarget,
                t.editItem,
              ].map((h) => (
                <th key={h} className="border-b p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={`${i.location_id}-${i.product_id}`}>
                <td className="border-b p-3">
                  <Link className="underline" href={`/inventory/${i.location_id}/${i.product_id}`}>
                    {i.product.name}
                  </Link>
                  {!i.product.active && <span className="ml-2">({t.inactive})</span>}
                </td>
                <td className="border-b p-3">
                  {locations.find((l) => l.id === i.location_id)?.name}
                </td>
                <td className="border-b p-3 font-semibold">{number(i.quantity, locale)}</td>
                <td className="border-b p-3">{t[i.product.unit]}</td>
                <td className="border-b p-3">{i.minimum_stock ?? t.notSet}</td>
                <td className="border-b p-3">{i.target_stock ?? t.notSet}</td>
                <td className="border-b p-3">
                  <Link
                    className="underline"
                    href={`/inventory/items?product=${i.product_id}&location=${i.location_id}`}
                  >
                    {t.editItem}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-5">{t.noProducts}</p>}
      </div>
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t.history}</h2>
        <label>
          {t.searchHistory}
          <input
            type="search"
            className="mt-1 min-h-12 w-full rounded-xl border bg-background px-3"
            value={historyQuery}
            onChange={(e) => {
              setHistoryQuery(e.target.value);
              setLimit(50);
            }}
          />
        </label>
        <div className="mt-4 divide-y rounded-xl border">
          {history.slice(0, limit).map((m) => (
            <Link
              key={m.id}
              className="block p-4"
              href={`/inventory/${m.location_id}/${m.product_id}`}
            >
              <p className="font-semibold">
                {m.productName} · {m.locationName} · {t[m.transaction_type]} ·{' '}
                {number(m.quantity, locale)}
              </p>
              <p>
                {m.actor} · <LocalTime locale={locale} value={m.created_at} />
              </p>
              {m.reverses_transaction_id && <p>{t.reversesAction}</p>}
            </Link>
          ))}
        </div>
        {!history.length && <p className="py-4">{t.noActivity}</p>}
        {history.length > limit && (
          <button className="mt-3 rounded-xl border p-3" onClick={() => setLimit(limit + 50)}>
            {t.next}
          </button>
        )}
      </section>
    </div>
  );
}
