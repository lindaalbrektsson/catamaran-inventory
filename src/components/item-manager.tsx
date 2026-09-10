'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { units } from '@/lib/domain';
import {
  validateItems,
  type ItemCatalog,
  type ItemInput,
  type PreviewRow,
  type ItemError,
} from '@/lib/item-domain';
import { saveItems, uploadItemPreview } from '@/lib/item-actions';
import { Button } from './ui/button';
export function ItemManager({
  catalog,
  locale,
  importing,
  requestId,
}: {
  catalog: ItemCatalog;
  locale: Locale;
  importing: boolean;
  requestId: string;
}) {
  const t = dictionary(locale),
    [pending, start] = useTransition(),
    [error, setError] = useState<ItemError>(),
    [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]),
    [id, setId] = useState(requestId);
  const [value, setValue] = useState<ItemInput>({
    name: '',
    category: '',
    unit: 'piece',
    location: '',
    minimum: '',
    target: '',
    cost: '',
    currency: 'BZD',
    quantity: '',
    notes: '',
    active: true,
    mode: 'create',
  });
  const update = (key: keyof ItemInput, v: string | boolean) => {
    setValue((old) => ({ ...old, [key]: v }));
    setId(crypto.randomUUID());
  };
  async function save(values: ItemInput[]) {
    setError(undefined);
    try {
      const result = await saveItems(id, values);
      setError(result.error);
      if (result.success) setSaved(true);
    } catch {
      setError('ITEM_FAILED');
    }
  }
  if (saved)
    return (
      <div role="status" className="grid gap-5">
        <p>{t.itemSaved}</p>
        <Link href="/inventory" className="underline">
          {t.itemBack}
        </Link>
      </div>
    );
  const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
  return (
    <div className="grid gap-5">
      {importing ? (
        <>
          <p className="text-sm">{t.itemExcelHint}</p>
          <p className="text-sm">{t.itemExportHint}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              start(async () => {
                setRows([]);
                setError(undefined);
                try {
                  const result = await uploadItemPreview(data);
                  if (result.rows) {
                    setRows(result.rows);
                    setId(crypto.randomUUID());
                  } else setError(result.error);
                } catch {
                  setError('ITEM_FAILED');
                }
              });
            }}
            className="grid gap-3"
          >
            <label>
              {t.importItems}
              <input
                className={control}
                name="file"
                type="file"
                accept=".xlsx"
                required
                disabled={pending}
              />
            </label>
            <Button disabled={pending}>{pending ? t.itemWorking : t.itemPreview}</Button>
          </form>
          {rows.map((row, i) => (
            <section className="rounded-xl border p-4" key={i}>
              <h2 className="font-semibold">
                {t.itemRow} {row.row}: {row.value.name}
              </h2>
              <dl className="my-3 grid gap-1 text-sm md:grid-cols-2">
                {Object.entries(row.value)
                  .filter(([k]) => !['mode', 'active', 'name', 'sourceRow'].includes(k))
                  .map(([key, v]) => {
                    const labels: Record<string, string> = {
                      category: t.category,
                      unit: t.itemUnit,
                      location: t.itemLocation,
                      minimum: t.itemMinimum,
                      target: t.itemTarget,
                      cost: t.itemCost,
                      currency: t.currency,
                      quantity: t.quantity,
                      notes: t.itemNotes,
                    };
                    const display =
                      key === 'category'
                        ? catalog.categories.find((c) => c.id === v)?.[
                            locale === 'es' ? 'name_es' : 'name_en'
                          ] || String(v)
                        : key === 'location'
                          ? catalog.locations.find((l) => l.id === v)?.name || String(v)
                          : String(v);
                    return (
                      <div key={key}>
                        <dt className="inline font-medium">{labels[key]}: </dt>
                        <dd className="inline break-words">{display}</dd>
                      </div>
                    );
                  })}
              </dl>
              {row.duplicate && (
                <label>
                  {t.ITEM_DUPLICATE}
                  <select
                    className={control}
                    value={row.value.mode}
                    disabled={pending}
                    onChange={(e) => {
                      const values = rows.map((r) => ({ ...r.value }));
                      values[i].mode = e.target.value as ItemInput['mode'];
                      setRows(validateItems(values, catalog));
                      setId(crypto.randomUUID());
                    }}
                  >
                    <option value="create">{t.itemChoose}</option>
                    <option value="skip">{t.itemSkip}</option>
                    <option value="update">{t.itemUpdate}</option>
                  </select>
                </label>
              )}
              {row.errors.map((err, n) => (
                <p key={n} className="text-sm text-destructive">
                  {t[err]}
                </p>
              ))}
            </section>
          ))}
          {!!rows.length && (
            <Button
              disabled={pending || rows.some((r) => r.errors.length > 0)}
              onClick={() => start(() => save(rows.map((r) => r.value)))}
            >
              {pending ? t.itemWorking : t.itemConfirm}
            </Button>
          )}
        </>
      ) : (
        <form
          className="grid max-w-lg gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateItems([value], catalog)[0].errors.length) {
              setError(validateItems([value], catalog)[0].errors[0]);
              return;
            }
            start(() => save([value]));
          }}
        >
          <label>
            {t.itemName}
            <input
              className={control}
              required
              maxLength={150}
              disabled={pending}
              value={value.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </label>
          <label>
            {t.category}
            <select
              className={control}
              required
              disabled={pending}
              value={value.category}
              onChange={(e) => update('category', e.target.value)}
            >
              <option value="">{t.itemChoose}</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === 'es' ? c.name_es : c.name_en}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.itemUnit}
            <select
              className={control}
              disabled={pending}
              value={value.unit}
              onChange={(e) => update('unit', e.target.value)}
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {t[u]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.itemLocation}
            <select
              className={control}
              required
              disabled={pending}
              value={value.location}
              onChange={(e) => update('location', e.target.value)}
            >
              <option value="">{t.itemChoose}</option>
              {catalog.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {(['minimum', 'target', 'cost'] as const).map((key) => (
            <label key={key}>
              {{ minimum: t.itemMinimum, target: t.itemTarget, cost: t.itemCost }[key]}
              <input
                className={control}
                inputMode="decimal"
                disabled={pending}
                value={value[key]}
                onChange={(e) => update(key, e.target.value.replace(',', '.'))}
              />
            </label>
          ))}
          <label>
            {t.currency}
            <select
              className={control}
              value={value.currency}
              disabled={pending}
              onChange={(e) => update('currency', e.target.value)}
            >
              {(['BZD', 'USD'] as const).map((currency) => (
                <option key={currency} value={currency}>
                  {t[currency]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.itemNotes}
            <textarea
              className={control}
              maxLength={1000}
              value={value.notes}
              disabled={pending}
              onChange={(e) => update('notes', e.target.value)}
            />
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              checked={value.active}
              disabled={pending}
              onChange={(e) => update('active', e.target.checked)}
            />
            {t.itemActive}
          </label>
          <Button disabled={pending}>{pending ? t.itemWorking : t.itemSave}</Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {t[error]}
        </p>
      )}
    </div>
  );
}
