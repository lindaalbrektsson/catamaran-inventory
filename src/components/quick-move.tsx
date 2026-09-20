'use client';
import { useState } from 'react';
import type { InventoryItem } from '@/lib/inventory';
import type { Balance, Location } from '@/lib/database.types';
import { dictionary, type Locale } from '@/lib/i18n';
import type { Role } from '@/lib/domain';
import { StockForm } from './stock-form';
import { TransferForm } from './transfer-form';
export function QuickMove({
  items,
  location,
  destinations,
  mode,
  locale,
  role,
  balances = [],
}: {
  items: InventoryItem[];
  location: Location;
  destinations: Location[];
  mode: 'remove' | 'transfer';
  locale: Locale;
  role: Role;
  balances?: Pick<Balance, 'product_id' | 'location_id' | 'quantity'>[];
}) {
  const t = dictionary(locale),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [highlight, setHighlight] = useState(0);
  const matches = items.filter((i) =>
    i.product.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)),
  );
  return (
    <div className="grid max-w-xl gap-4">
      {mode === 'transfer' && destinations.length === 1 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <span data-location={location.type} className="location-header">
            {location.name}
          </span>
          <span aria-hidden="true">→</span>
          <span data-location={destinations[0].type} className="location-header">
            {destinations[0].name}
          </span>
        </p>
      )}
      <label className="grid gap-2">
        {t.itemName}
        <input
          autoFocus
          role="combobox"
          aria-expanded={!selected}
          aria-controls="move-items"
          aria-autocomplete="list"
          className="min-h-12 rounded-xl border p-3"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected('');
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((v) => Math.min(v + 1, matches.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((v) => Math.max(v - 1, 0));
            }
            if (e.key === 'Enter' && !selected && matches[highlight]) {
              e.preventDefault();
              setSelected(matches[highlight].product_id);
              setQuery(matches[highlight].product.name);
            }
          }}
          aria-activedescendant={
            !selected && matches[highlight] ? `move-${matches[highlight].product_id}` : undefined
          }
          spellCheck
          lang={locale}
        />
      </label>
      {!selected && (
        <div id="move-items" role="listbox" aria-label={t.itemName} className="grid gap-2">
          {matches.map((i) => (
            <button
              id={`move-${i.product_id}`}
              role="option"
              aria-selected={false}
              key={i.product_id}
              className="min-h-12 rounded-xl border p-3 text-left"
              onClick={() => {
                setSelected(i.product_id);
                setQuery(i.product.name);
              }}
            >
              {i.product.name} · {i.quantity}
            </button>
          ))}
          {!matches.length && <p>{t.noProducts}</p>}
        </div>
      )}
      {selected &&
        (mode === 'remove' ? (
          <StockForm
            key={selected}
            simple
            locale={locale}
            role={role}
            productId={selected}
            locationId={location.id}
            mode="remove"
            requestId={crypto.randomUUID()}
          />
        ) : (
          <TransferForm
            key={selected}
            locale={locale}
            productId={selected}
            sourceId={location.id}
            source={{
              ...location,
              quantity: Number(items.find((i) => i.product_id === selected)!.quantity),
            }}
            unit={t[items.find((i) => i.product_id === selected)!.product.unit]}
            destinations={destinations.map((l) => ({
              ...l,
              quantity: balances.find((b) => b.product_id === selected && b.location_id === l.id)
                ?.quantity,
            }))}
            requestId={crypto.randomUUID()}
          />
        ))}
    </div>
  );
}
