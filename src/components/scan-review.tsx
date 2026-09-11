'use client';
import { useState } from 'react';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import {
  initialReview,
  scanMatch,
  scanReviewSchema,
  type Extraction,
  type ScanReview,
} from '@/lib/scan-domain';
import type { ItemCatalog } from '@/lib/item-domain';
import { approveScan } from '@/lib/scan-actions';
import { units } from '@/lib/domain';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function ScanReviewForm({
  id,
  type,
  result,
  catalog,
  locale,
}: {
  id: string;
  type: 'NOTE' | 'RECEIPT';
  result: Extraction;
  catalog: ItemCatalog;
  locale: Locale;
}) {
  const t = dictionary(locale);
  const [review, setReview] = useState(() => initialReview(result, catalog, type)),
    [error, setError] = useState<Key>(),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  // Keep decimal text intact while typing (including a trailing decimal separator).
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      result.items.map((r, i) => [i, r.quantity === null ? '' : String(r.quantity)]),
    ),
  );
  const selectClass = 'min-h-11 w-full rounded-xl border bg-background p-2';
  function rowChange(index: number, values: Partial<ScanReview['rows'][number]>) {
    setReview((v) => ({
      ...v,
      rows: v.rows.map((r) => (r.index === index ? { ...r, ...values } : r)),
    }));
  }
  if (saved) return <p role="status">{t.scanApproved}</p>;
  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const candidate = {
          ...review,
          rows: review.rows.map((r) => ({
            ...r,
            quantity: quantities[r.index]?.trim()
              ? Number(quantities[r.index].replace(',', '.'))
              : null,
          })),
        };
        if (
          !scanReviewSchema.safeParse(candidate).success ||
          candidate.rows.some(
            (r) =>
              r.action === 'INVENTORY' &&
              ((type === 'NOTE' && !r.location) ||
                (!r.product && !r.category) ||
                (type === 'NOTE' && !r.quantity)),
          )
        ) {
          setError('scanInvalid');
          return;
        }
        if (!window.confirm(t.scanConfirm)) return;
        setBusy(true);
        setError(undefined);
        try {
          const state = await approveScan(id, candidate);
          if (state.error) setError(state.error);
          else setSaved(true);
        } catch {
          setError('scanFailed');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        {type === 'NOTE' ? t.scanHint : t.scanReceiptHint}
      </p>
      <fieldset disabled={busy} className="grid gap-5">
        {type === 'RECEIPT' && (
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <label>
              {t.supplier}
              <Input
                value={review.supplier}
                onChange={(e) => setReview((v) => ({ ...v, supplier: e.target.value }))}
              />
            </label>
            <label>
              {t.scanDate}
              <Input
                type="date"
                value={review.date}
                onChange={(e) => setReview((v) => ({ ...v, date: e.target.value }))}
              />
            </label>
            <label>
              {t.scanTotal}
              <Input
                inputMode="decimal"
                value={review.total}
                onChange={(e) =>
                  setReview((v) => ({ ...v, total: e.target.value.replace(',', '.') }))
                }
              />
            </label>
            <label>
              {t.currency}
              <select
                className={selectClass}
                value={review.currency}
                onChange={(e) =>
                  setReview((v) => ({ ...v, currency: e.target.value as ScanReview['currency'] }))
                }
              >
                <option value="">{t.scanChoose}</option>
                <option value="BZD">{t.BZD}</option>
                <option value="USD">{t.USD}</option>
              </select>
            </label>
          </div>
        )}
        {review.rows.map((row) => {
          const match = scanMatch(catalog, row.name),
            original = result.items[row.index];
          return (
            <section key={row.index} className="grid gap-3 rounded-2xl border bg-card p-4">
              <p
                className={
                  match.status === 'UNCERTAIN' || original.check
                    ? 'font-semibold text-warning'
                    : 'font-semibold'
                }
              >
                {original.check
                  ? t.scanUncertain
                  : match.status === 'MATCHED'
                    ? t.scanMatched
                    : match.status === 'NEW'
                      ? t.scanNew
                      : t.scanUncertain}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  {t.scanName}
                  <Input
                    value={row.name}
                    maxLength={150}
                    spellCheck
                    lang={locale}
                    onChange={(e) =>
                      rowChange(row.index, {
                        name: e.target.value,
                        product: '',
                        confirmSimilar: false,
                      })
                    }
                  />
                </label>
                <label>
                  {t.quantity}
                  <Input
                    inputMode="decimal"
                    value={quantities[row.index] ?? ''}
                    onChange={(e) => setQuantities((v) => ({ ...v, [row.index]: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                {t.scanMatch}
                <select
                  className={selectClass}
                  value={row.product}
                  onChange={(e) =>
                    rowChange(row.index, { product: e.target.value, confirmSimilar: false })
                  }
                >
                  <option value="">{t.scanNoMatch}</option>
                  {catalog.products
                    .filter((p) => p.active)
                    .sort(
                      (a, b) =>
                        Number(match.matches.some((m) => m.id === b.id)) -
                          Number(match.matches.some((m) => m.id === a.id)) ||
                        a.name.localeCompare(b.name),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {match.matches.length > 0 && !row.product && (
                <p className="text-sm">
                  {t.scanUncertain}: {match.matches.map((p) => p.name).join(', ')}
                </p>
              )}
              <label>
                {t.scanAction}
                <select
                  className={selectClass}
                  value={row.action}
                  onChange={(e) =>
                    rowChange(row.index, {
                      action: e.target.value as ScanReview['rows'][number]['action'],
                    })
                  }
                >
                  <option value="IGNORE">{t.scanIgnore}</option>
                  <option value="INVENTORY">
                    {type === 'NOTE' ? t.scanInventory : t.scanCatalog}
                  </option>
                  <option value="NEED">{t.scanNeed}</option>
                </select>
              </label>
              {row.action === 'INVENTORY' && (
                <>
                  {type === 'NOTE' && (
                    <label>
                      {t.location}
                      <select
                        required
                        className={selectClass}
                        value={row.location}
                        onChange={(e) => rowChange(row.index, { location: e.target.value })}
                      >
                        <option value="">{t.scanChoose}</option>
                        {catalog.locations.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!row.product && (
                    <>
                      <label>
                        {t.category}
                        <select
                          required
                          className={selectClass}
                          value={row.category}
                          onChange={(e) => rowChange(row.index, { category: e.target.value })}
                        >
                          <option value="">{t.scanChoose}</option>
                          {catalog.categories.map((c) => (
                            <option value={c.id} key={c.id}>
                              {locale === 'es' ? c.name_es : c.name_en}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.scanUnit}
                        <select
                          className={selectClass}
                          value={row.unit}
                          onChange={(e) =>
                            rowChange(row.index, {
                              unit: e.target.value as ScanReview['rows'][number]['unit'],
                            })
                          }
                        >
                          {units.map((u) => (
                            <option key={u} value={u}>
                              {t[u]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {match.matches.length > 0 && (
                        <label className="flex min-h-11 items-center gap-2">
                          <input
                            type="checkbox"
                            required
                            checked={row.confirmSimilar}
                            onChange={(e) =>
                              rowChange(row.index, { confirmSimilar: e.target.checked })
                            }
                          />
                          {t.scanSimilar}
                        </label>
                      )}
                    </>
                  )}
                </>
              )}
              {row.action === 'NEED' && (
                <label>
                  {t.scanCountry}
                  <select
                    className={selectClass}
                    value={row.country}
                    onChange={(e) =>
                      rowChange(row.index, { country: e.target.value as 'BELIZE' | 'USA' })
                    }
                  >
                    <option value="BELIZE">{t.BELIZE}</option>
                    <option value="USA">{t.USA}</option>
                  </select>
                </label>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setReview((v) => ({ ...v, rows: v.rows.filter((r) => r.index !== row.index) }))
                }
              >
                {t.scanRemove}
              </Button>
            </section>
          );
        })}
      </fieldset>
      {error && <p role="alert">{t[error]}</p>}
      <Button disabled={busy}>{busy ? t.loading : t.scanApprove}</Button>
    </form>
  );
}
