'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import type { ItemCatalog } from '@/lib/item-domain';
import { needMatches, suggestedNeedQuantity } from '@/lib/need-matching';
export function NeedItemPicker({
  catalog,
  locale,
  productId,
  onProduct,
  name: initialName,
}: {
  catalog: ItemCatalog;
  locale: Locale;
  productId: string;
  onProduct: (id: string) => void;
  name: string;
}) {
  const t = dictionary(locale),
    list = useId();
  const [name, setName] = useState(
      catalog.products.find((p) => p.id === productId)?.name ?? initialName,
    ),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const matches = needMatches(catalog, name),
    selected = catalog.products.find((p) => p.id === productId);
  const quantity = productId ? suggestedNeedQuantity(catalog, productId) : null;
  const linkedLocation = catalog.locations.find((l) =>
    catalog.balances?.some((b) => b.product_id === productId && b.location_id === l.id),
  );
  function choose(id: string) {
    const p = catalog.products.find((p) => p.id === id);
    if (!p) return;
    onProduct(id);
    setName(p.name);
    setOpen(false);
  }
  function stocks(id: string) {
    return catalog.locations.map((l) => {
      const b = catalog.balances?.find((b) => b.product_id === id && b.location_id === l.id);
      return (
        <span className="block text-sm" key={l.id}>
          {l.name}: {b ? Number(b.quantity) : t.notSet}
          {b && (
            <>
              {' '}
              · {t.minimum}: {Number(b.minimum_stock)}
            </>
          )}
        </span>
      );
    });
  }
  return (
    <div className="grid gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <label className="grid gap-2">
        {t.itemName}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={list}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${list}-${active}` : undefined}
          className="min-h-12 w-full rounded-xl border bg-background p-3"
          name="name"
          value={name}
          required
          maxLength={150}
          spellCheck
          lang={locale}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            onProduct('');
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (open && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
              e.preventDefault();
              setActive((n) =>
                Math.max(0, Math.min(matches.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))),
              );
            }
            if (open && e.key === 'Enter' && matches[active]) {
              e.preventDefault();
              choose(matches[active].id);
            }
          }}
        />
      </label>
      {open && (
        <div className="rounded-xl border bg-card p-2">
          <ul id={list} role="listbox" aria-label={t.needRelated}>
            {matches.map((p, index) => (
              <li key={p.id} role="presentation">
                <button
                  id={`${list}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  className="min-h-12 w-full rounded-lg p-3 text-left hover:bg-secondary focus:bg-secondary"
                  onClick={() => choose(p.id)}
                >
                  <strong>{p.name}</strong>
                  <span className="block text-sm">{t.needExistingItem}</span>
                  {stocks(p.id)}
                </button>
              </li>
            ))}
          </ul>
          {name.trim() && (
            <button
              type="button"
              className="min-h-12 w-full rounded-lg border p-3 text-left"
              onClick={() => {
                onProduct('');
                setOpen(false);
              }}
            >
              {t.needCreateText.replace('{name}', name.trim())}
            </button>
          )}
        </div>
      )}
      {selected && (
        <div className="rounded-xl bg-secondary p-3">
          <p className="font-semibold">
            {t.needLinkedItem}: {selected.name}
          </p>
          {stocks(selected.id)}
          {quantity !== null && quantity > 0 && (
            <p className="mt-2 text-sm">
              {t.needSuggestedQuantity}: {quantity} {t[selected.unit]}
            </p>
          )}
          {linkedLocation && (
            <Link
              className="mt-2 inline-flex min-h-12 items-center underline"
              href={`/inventory/${linkedLocation.id}/${selected.id}`}
            >
              {t.needRelated}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
