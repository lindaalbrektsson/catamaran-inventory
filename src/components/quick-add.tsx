'use client';
import { useActionState, useId, useState } from 'react';
import { quickAdd } from '@/lib/quick-actions';
import { units } from '@/lib/domain';
import { normalizedName } from '@/lib/quick-domain';
import type { ItemCatalog } from '@/lib/item-domain';
import { dictionary, type Locale } from '@/lib/i18n';
import { usePreservedForm } from './use-preserved-form';
import { Button } from './ui/button';
export function QuickAdd({
  catalog,
  locale,
  locationId = '',
  requestId,
}: {
  catalog: ItemCatalog;
  locale: Locale;
  locationId?: string;
  requestId: string;
}) {
  const ref = usePreservedForm();
  const t = dictionary(locale),
    [state, action, pending] = useActionState(quickAdd, {}),
    [name, setName] = useState(''),
    [product, setProduct] = useState(''),
    [creating, setCreating] = useState(false),
    [quantity, setQuantity] = useState(''),
    [category, setCategory] = useState(''),
    [unit, setUnit] = useState<string>('piece'),
    [minimum, setMinimum] = useState(''),
    [keepMinimum, setKeepMinimum] = useState(false),
    [location, setLocation] = useState(locationId),
    [confirm, setConfirm] = useState(false),
    [request, setRequest] = useState(requestId),
    [active, setActive] = useState(-1),
    [open, setOpen] = useState(true),
    listId = useId();
  const query = name.trim().toLocaleLowerCase();
  const matches =
    query || category
      ? catalog.products
          .filter(
            (p) =>
              (!category ||
                p.category_id === category ||
                (!!query && normalizedName(p.name) === normalizedName(query))) &&
              (p.name.toLocaleLowerCase().includes(query) ||
                normalizedName(p.name).includes(normalizedName(query))),
          )
          .slice(0, 12)
      : [];
  const exact = catalog.products.some((p) => p.name.trim().toLocaleLowerCase() === query);
  const similar = catalog.products.some((p) => normalizedName(p.name) === normalizedName(name));
  const canCreate = !!query && !exact;
  const count = matches.length + (canCreate ? 1 : 0);
  const changed = () => {
    setRequest(crypto.randomUUID());
    setConfirm(false);
  };
  const choose = (index: number) => {
    changed();
    if (index === matches.length && canCreate) {
      setProduct('');
      setCreating(true);
    } else if (matches[index]?.active) {
      setProduct(matches[index].id);
      setCategory(matches[index].category_id);
      setName(matches[index].name);
      setCreating(false);
    } else return;
    setOpen(false);
    setActive(-1);
  };
  const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
  return (
    <form ref={ref} action={action} className="grid max-w-xl gap-4">
      <input type="hidden" name="requestId" value={request} />
      <input type="hidden" name="product" value={product} />
      <label className="grid gap-2">
        {t.category}
        <select
          name="category"
          required={creating}
          className={control}
          value={category}
          disabled={pending}
          onChange={(e) => {
            changed();
            setCategory(e.target.value);
            setProduct('');
            setOpen(true);
            setActive(-1);
          }}
        >
          <option value="">{creating ? t.itemChoose : t.allCategories}</option>
          {catalog.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {locale === 'es' ? c.name_es : c.name_en}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        {t.quickSearch}
        <input
          name="name"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && count > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoFocus
          autoComplete="off"
          spellCheck
          lang={locale}
          maxLength={150}
          required
          className={control}
          value={name}
          disabled={pending}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            changed();
            setName(e.target.value);
            setProduct('');
            setCreating(false);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, count - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && open && active >= 0) {
              e.preventDefault();
              choose(active);
            }
          }}
        />
      </label>
      {open && count > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t.quickSearch}
          className="max-h-64 overflow-auto rounded-xl border bg-card"
        >
          {matches.map((p, i) => (
            <li
              role="option"
              aria-selected={active === i}
              aria-disabled={!p.active}
              id={`${listId}-${i}`}
              key={p.id}
              className={`min-h-12 cursor-pointer p-3 ${active === i ? 'bg-secondary' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {p.name}
              {!p.active && ` (${t.inactive})`}
            </li>
          ))}
          {canCreate && (
            <li
              role="option"
              aria-selected={active === matches.length}
              id={`${listId}-${matches.length}`}
              className="min-h-14 cursor-pointer border-t bg-secondary p-3 font-medium"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(matches.length)}
            >
              {t.quickCreate}: “{name.trim()}”
            </li>
          )}
        </ul>
      )}
      {product && (
        <p className="text-sm">
          {t.quickSelected}: {name} · {t[catalog.products.find((p) => p.id === product)!.unit]}
        </p>
      )}
      {locationId ? (
        <input type="hidden" name="location" value={locationId} />
      ) : (
        <label className="grid gap-2">
          {t.itemLocation}
          <select
            name="location"
            required
            className={control}
            value={location}
            disabled={pending}
            onChange={(e) => {
              changed();
              setLocation(e.target.value);
            }}
          >
            <option value="">{t.itemChoose}</option>
            {catalog.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {creating && (
        <>
          <label className="grid gap-2">
            {t.itemUnit}
            <select
              name="unit"
              className={control}
              value={unit}
              disabled={pending}
              onChange={(e) => {
                changed();
                setUnit(e.target.value);
              }}
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {t[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={keepMinimum}
              disabled={pending}
              onChange={(e) => {
                changed();
                setKeepMinimum(e.target.checked);
                if (!e.target.checked) setMinimum('');
              }}
            />
            {t.keepMinimum}
          </label>
          {keepMinimum && (
            <label className="grid gap-2">
              {t.minimumQuantity}
              <input
                name="minimum"
                inputMode="decimal"
                required
                className={control}
                value={minimum}
                disabled={pending}
                onChange={(e) => {
                  changed();
                  setMinimum(e.target.value);
                }}
              />
            </label>
          )}
        </>
      )}
      {creating && (similar || state.error === 'SIMILAR_ITEM') && (
        <div className="rounded-xl border bg-secondary p-3">
          <p>{t.quickSimilar}</p>
          <div className="mt-2 grid gap-2">
            {matches
              .filter((p) => normalizedName(p.name) === normalizedName(name))
              .map((p) => (
                <button
                  type="button"
                  key={p.id}
                  disabled={!p.active || pending}
                  className="min-h-12 rounded-xl border bg-card p-3 text-left"
                  onClick={() => choose(matches.findIndex((m) => m.id === p.id))}
                >
                  {p.name}
                  {!p.active && ` (${t.inactive})`}
                </button>
              ))}
          </div>
          <label className="mt-3 flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              name="confirmDuplicate"
              checked={confirm}
              onChange={(e) => {
                setRequest(crypto.randomUUID());
                setConfirm(e.target.checked);
              }}
            />
            {t.quickConfirm}
          </label>
        </div>
      )}
      <label className="grid gap-2">
        {t.quantity}
        <input
          name="quantity"
          inputMode="decimal"
          required
          className={control}
          value={quantity}
          disabled={pending}
          onChange={(e) => {
            changed();
            setQuantity(e.target.value);
          }}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {t[state.error]}
        </p>
      )}
      <Button className="min-h-14" disabled={pending || (!product && !creating)}>
        {pending ? t.saving : t.save}
      </Button>
    </form>
  );
}
