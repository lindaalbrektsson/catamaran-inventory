'use client';
import { TestDataField } from './test-data';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { units } from '@/lib/domain';
import {
  validateItems,
  validateItemEdit,
  type ItemCatalog,
  type ItemInput,
  type PreviewRow,
  type ItemError,
} from '@/lib/item-domain';
import { updateCatalogItem } from '@/lib/catalog-actions';
import { saveItems, uploadItemPreview } from '@/lib/item-actions';
import { Button } from './ui/button';
export function ItemManager({
  catalog,
  locale,
  importing,
  requestId,
  initial,
  productId,
}: {
  catalog: ItemCatalog;
  locale: Locale;
  importing: boolean;
  requestId: string;
  initial?: ItemInput;
  productId?: string;
}) {
  const t = dictionary(locale),
    [pending, start] = useTransition(),
    [error, setError] = useState<ItemError>(),
    [saved, setSaved] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]),
    [id, setId] = useState(requestId);
  const [value, setValue] = useState<ItemInput>(
    initial ?? {
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
    },
  );
  const [keepMinimum, setKeepMinimum] = useState(
    initial?.minimum !== undefined && initial.minimum !== '',
  );
  const update = (key: keyof ItemInput, v: string | boolean) => {
    setValue((old) => ({ ...old, [key]: v }));
    setId(crypto.randomUUID());
  };
  async function save(values: ItemInput[]) {
    setError(undefined);
    try {
      const result = productId
        ? await updateCatalogItem(productId, values[0])
        : await saveItems(id, values, !importing && isTest);
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
                  .filter(
                    ([k]) =>
                      !['mode', 'active', 'name', 'sourceRow', 'cost', 'currency'].includes(k),
                  )
                  .map(([key, v]) => {
                    const labels: Record<string, string> = {
                      category: t.category,
                      unit: t.itemUnit,
                      location: t.itemLocation,
                      minimum: t.itemMinimum,
                      target: t.itemTarget,
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
              {(!!row.similar?.length || row.errors.includes('ITEM_SIMILAR')) && (
                <div className="grid gap-2 rounded-xl border p-3">
                  <p>{t.quickSimilar}</p>
                  {row.similar?.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={control}
                      disabled={pending}
                      onClick={() => {
                        const values = rows.map((r) => ({ ...r.value }));
                        values[i].name = p.name;
                        values[i].mode = 'update';
                        setRows(validateItems(values, catalog));
                        setId(crypto.randomUUID());
                      }}
                    >
                      {t.catalogUse} · {p.name}
                    </button>
                  ))}
                  <label className="flex min-h-12 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!row.value.confirmDuplicate}
                      disabled={pending}
                      onChange={(e) => {
                        const values = rows.map((r) => ({ ...r.value }));
                        values[i].confirmDuplicate = e.target.checked;
                        setRows(validateItems(values, catalog));
                        setId(crypto.randomUUID());
                      }}
                    />
                    {t.catalogCreateNew}
                  </label>
                </div>
              )}
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
            const errors = productId
              ? validateItemEdit(value, productId, catalog)
              : validateItems([value], catalog)[0].errors;
            if (errors.length) {
              setError(errors[0]);
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
              disabled={pending || Boolean(productId)}
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
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={keepMinimum}
              disabled={pending}
              onChange={(e) => {
                setKeepMinimum(e.target.checked);
                if (!e.target.checked) update('minimum', '');
              }}
            />
            {t.keepMinimum}
          </label>
          {keepMinimum && (
            <label>
              {t.minimumQuantity}
              <input
                className={control}
                inputMode="decimal"
                required
                disabled={pending}
                value={value.minimum}
                onChange={(e) => update('minimum', e.target.value.replace(',', '.'))}
              />
            </label>
          )}
          <label>
            {t.itemTarget}
            <input
              className={control}
              inputMode="decimal"
              disabled={pending}
              value={value.target}
              onChange={(e) => update('target', e.target.value.replace(',', '.'))}
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
            {!productId && (
              <TestDataField
                locale={locale}
                disabled={pending}
                onChange={(v) => {
                  setIsTest(v);
                  setId(crypto.randomUUID());
                }}
              />
            )}
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
