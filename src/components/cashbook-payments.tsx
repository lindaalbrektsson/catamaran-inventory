'use client';

import { useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import type { CashbookData, CashbookDue, CashbookTemplate } from '@/lib/cashbook-types';
import {
  foodSettlementPeriod,
  foodTotalMinor,
  minorToInput,
  moneyToMinor,
  sumMinor,
} from '@/lib/cashbook-domain';
import {
  CashbookAccountField,
  CashbookAmount,
  CashbookComment,
  CashbookConfirmation,
  CashbookDateField,
  CashbookForm,
  cashbookControl,
  cashbookDay,
  cashbookMoney,
} from './cashbook-controls';
import { Button } from './ui/button';
import { Input } from './ui/input';

function foodGroups(rows: CashbookDue[]) {
  const days = [...new Set(rows.map((row) => row.effective_date))].sort();
  return days.map((date) => ({ date, rows: rows.filter((row) => row.effective_date === date) }));
}

export function CashbookFoodLines({
  rows,
  locale,
  onEdit,
}: {
  rows: CashbookDue[];
  locale: Locale;
  onEdit?: (id: string) => void;
}) {
  const t = dictionary(locale);
  return (
    <div className="grid gap-4">
      {foodGroups(rows).map((group) => (
        <section key={group.date} className="rounded-xl border p-3">
          <h4 className="mb-3 font-semibold">{cashbookDay(group.date, locale)}</h4>
          <ul className="grid gap-3">
            {group.rows.map((row) => (
              <li key={row.id} className="grid gap-1 border-b pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium">
                    {locale === 'es' ? row.name_es : row.name_en}
                    {' × '}
                    {row.quantity}
                  </span>
                  <span className="tabular-nums">
                    {cashbookMoney(row.amount_cents ?? 0, locale)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.cashbookUnitAmount}: {cashbookMoney(row.unit_amount_cents ?? 0, locale)}
                </p>
                {row.comment && <p className="text-sm">{row.comment}</p>}
                <p className="break-all text-xs text-muted-foreground">
                  {t.cashbookCreatedBy}: {row.creator_name ?? row.created_by}
                </p>
                {row.status === 'PAID' && (
                  <p className="text-xs text-muted-foreground">
                    {t.cashbookPaid} · {row.paid_by_name ?? row.paid_by}
                    {row.paid_at &&
                      ` · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'America/Belize' }).format(new Date(row.paid_at))}`}
                  </p>
                )}
                {onEdit && row.status === 'PENDING' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1 w-fit"
                    onClick={() => onEdit(row.id)}
                  >
                    {t.cashbookEditEntry}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between gap-3 border-t pt-3 text-sm font-semibold">
            <span>{t.cashbookDayTotal}</span>
            <span>
              {cashbookMoney(sumMinor(group.rows.map((row) => row.amount_cents ?? 0)), locale)}
            </span>
          </p>
        </section>
      ))}
    </div>
  );
}

export function FoodEntryForm({
  locale,
  today,
  templates,
  entry,
  onClose,
}: {
  locale: Locale;
  today: string;
  templates: CashbookTemplate[];
  entry?: CashbookDue;
  onClose: () => void;
}) {
  const t = dictionary(locale),
    active = templates.filter((template) => template.kind === 'FOOD' && template.active);
  const [template, setTemplate] = useState(entry?.template_id ?? active[0]?.id ?? '');
  const initialPrice = entry?.unit_amount_cents ?? active[0]?.default_amount_cents;
  const [quantity, setQuantity] = useState(String(entry?.quantity ?? 1));
  const [price, setPrice] = useState(initialPrice == null ? '' : minorToInput(initialPrice));
  let total: number | null = null;
  try {
    total = foodTotalMinor(quantity, moneyToMinor(price, { allowZero: true }));
  } catch {
    /* Inline preview remains empty until valid. */
  }
  if (!entry && active.length === 0)
    return (
      <div className="grid gap-3 rounded-xl border p-4">
        <p>{t.cashbookNoFoodTemplates}</p>
        <Button variant="outline" onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    );
  return (
    <CashbookForm
      locale={locale}
      operation={entry ? 'UPDATE_DUE' : 'ADD_FOOD'}
      title={entry ? t.cashbookEditEntry : t.cashbookAddFood}
      onSaved={onClose}
      onCancel={onClose}
    >
      {entry && (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      )}
      <label className="grid gap-2 text-sm font-medium">
        {t.cashbookConcept}
        {entry ? (
          <span className="rounded-xl bg-muted p-3">
            {locale === 'es' ? entry.name_es : entry.name_en}
          </span>
        ) : (
          <select
            name="template_id"
            value={template}
            onChange={(event) => {
              setTemplate(event.target.value);
              const next = active.find(
                (item) => item.id === event.target.value,
              )?.default_amount_cents;
              setPrice(next == null ? '' : minorToInput(next));
            }}
            required
            className={cashbookControl}
          >
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {locale === 'es' ? item.name_es : item.name_en}
              </option>
            ))}
          </select>
        )}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          {t.cashbookQuantity}
          <Input
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            step={1}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <CashbookAmount
          name="unit_amount"
          label={t.cashbookUnitAmount}
          value={price}
          onChange={setPrice}
        />
      </div>
      <p
        className="flex justify-between gap-3 rounded-xl bg-secondary p-3 font-semibold"
        aria-live="polite"
      >
        <span>{t.cashbookLineTotal}</span>
        <span>{total == null ? '—' : cashbookMoney(total, locale)}</span>
      </p>
      <p className="text-sm text-muted-foreground">{t.cashbookEntryOverride}</p>
      <CashbookDateField locale={locale} today={entry?.effective_date ?? today} />
      <CashbookComment locale={locale} defaultValue={entry?.comment} />
    </CashbookForm>
  );
}

function PaymentForm({
  locale,
  today,
  rows,
  onClose,
}: {
  locale: Locale;
  today: string;
  rows: CashbookDue[];
  onClose: () => void;
}) {
  const t = dictionary(locale),
    food = rows[0]?.kind === 'FOOD';
  const total = sumMinor(rows.map((row) => row.amount_cents ?? 0));
  return (
    <CashbookForm
      locale={locale}
      operation="PAY"
      title={t.cashbookReviewPayment}
      submitLabel={t.cashbookConfirmPay}
      onSaved={onClose}
      onCancel={onClose}
    >
      {rows.map((row) => (
        <input key={row.id} type="hidden" name="ids" value={row.id} />
      ))}
      <input
        type="hidden"
        name="versions"
        value={JSON.stringify(Object.fromEntries(rows.map((row) => [row.id, row.version])))}
      />
      <input type="hidden" name="expected_total" value={minorToInput(total)} />
      {food ? (
        <>
          <p className="text-sm text-muted-foreground">{t.cashbookFoodPaymentHelp}</p>
          <h4 className="font-medium">{t.cashbookIncludedLines}</h4>
          <CashbookFoodLines rows={rows} locale={locale} />
          <p className="flex justify-between gap-3 rounded-xl bg-secondary p-4 text-lg font-semibold">
            <span>{t.cashbookTotalDue}</span>
            <span>{cashbookMoney(total, locale)}</span>
          </p>
          <input type="hidden" name="amount" value={minorToInput(total)} />
          <input type="hidden" name="comment" value={t.cashbookWeeklyFood} />
        </>
      ) : (
        <>
          <p className="font-medium">
            {locale === 'es' ? rows[0].name_es : rows[0].name_en} ·{' '}
            {cashbookDay(rows[0].period_month!, locale, true)}
          </p>
          <CashbookAmount label={t.cashbookAmount} defaultCents={rows[0].amount_cents} />
          <p className="text-sm text-muted-foreground">{t.cashbookOccurrenceOverride}</p>
          <input
            type="hidden"
            name="comment"
            value={`${locale === 'es' ? rows[0].name_es : rows[0].name_en} — ${cashbookDay(rows[0].period_month!, locale, true)}`}
          />
        </>
      )}
      <CashbookAccountField locale={locale} name="source_account" label={t.cashbookSource} />
      <CashbookDateField locale={locale} today={today} />
      <CashbookConfirmation label={t.cashbookConfirmPayment} />
    </CashbookForm>
  );
}

function MonthlyEditForm({
  locale,
  row,
  onClose,
}: {
  locale: Locale;
  row: CashbookDue;
  onClose: () => void;
}) {
  const t = dictionary(locale);
  return (
    <CashbookForm
      locale={locale}
      operation="UPDATE_DUE"
      title={t.cashbookEditAmount}
      onSaved={onClose}
      onCancel={onClose}
    >
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="version" value={row.version} />
      <input type="hidden" name="effective_date" value={row.effective_date} />
      <p className="font-medium">
        {locale === 'es' ? row.name_es : row.name_en} ·{' '}
        {cashbookDay(row.period_month!, locale, true)}
      </p>
      <CashbookAmount label={t.cashbookAmount} defaultCents={row.amount_cents} />
      <p className="text-sm text-muted-foreground">{t.cashbookOccurrenceOverride}</p>
      <CashbookComment locale={locale} defaultValue={row.comment} />
    </CashbookForm>
  );
}

export function CashbookPayments({
  locale,
  data,
  initialFood = false,
}: {
  locale: Locale;
  data: CashbookData;
  initialFood?: boolean;
}) {
  const t = dictionary(locale),
    { dues, today, templates } = data;
  const [foodView, setFoodView] = useState<'all' | 'today' | 'period' | 'previous'>(
    data.filters.foodView,
  );
  const [editing, setEditing] = useState<string | null>(initialFood ? 'new' : null);
  const [paying, setPaying] = useState<string | null>(null);
  const [reviewedRows, setReviewedRows] = useState<CashbookDue[]>([]);
  const food = dues.filter((row) => row.kind === 'FOOD' && row.status === 'PENDING');
  const period = foodSettlementPeriod(today);
  const visibleFood = food.filter(
    (row) =>
      foodView === 'all' ||
      (foodView === 'today'
        ? row.effective_date === today
        : foodView === 'previous'
          ? row.effective_date < period.from
          : row.effective_date >= period.from && row.effective_date <= period.to),
  );
  const total = sumMinor(food.map((row) => row.amount_cents ?? 0));
  const monthly = dues.filter(
    (row) => row.kind === 'MONTHLY' && row.period_month === data.filters.month,
  );
  const paid = dues.filter((row) => row.kind === 'FOOD' && row.status === 'PAID');
  return (
    <div className="grid gap-6" id="payments">
      <section
        className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5"
        aria-label={t.cashbookFood}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t.cashbookFood}</h2>
          {!editing && !paying && (
            <Button onClick={() => setEditing('new')}>{t.cashbookAddFood}</Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t.cashbookFoodPeriodHelp}</p>
        <p className="text-sm">
          {cashbookDay(period.from, locale)} — {cashbookDay(period.to, locale)}
        </p>
        {editing === 'new' || (editing && food.some((row) => row.id === editing)) ? (
          <FoodEntryForm
            key={editing}
            locale={locale}
            today={today}
            templates={templates}
            entry={food.find((row) => row.id === editing)}
            onClose={() => setEditing(null)}
          />
        ) : paying === 'food' ? (
          <PaymentForm
            locale={locale}
            today={today}
            rows={reviewedRows}
            onClose={() => setPaying(null)}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t.cashbookFood}>
              {(['all', 'today', 'period', 'previous'] as const).map((view) => (
                <Button
                  key={view}
                  variant={foodView === view ? 'default' : 'outline'}
                  aria-pressed={foodView === view}
                  onClick={() => setFoodView(view)}
                >
                  {view === 'all'
                    ? t.cashbookAllUnpaid
                    : view === 'today'
                      ? t.cashbookToday
                      : view === 'period'
                        ? t.cashbookPeriod
                        : t.cashbookPrevious}
                </Button>
              ))}
            </div>
            {visibleFood.length ? (
              <CashbookFoodLines rows={visibleFood} locale={locale} onEdit={setEditing} />
            ) : (
              <p className="py-3 text-sm text-muted-foreground">{t.cashbookNoFood}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="grid gap-1">
                <span className="text-sm text-muted-foreground">
                  {t.cashbookTotalDue} · {t.cashbookAllUnpaid}
                </span>
                <strong className="text-2xl tabular-nums">{cashbookMoney(total, locale)}</strong>
              </p>
              <Button
                disabled={!food.length || Boolean(editing || paying)}
                onClick={() => {
                  setReviewedRows(food);
                  setPaying('food');
                }}
              >
                {t.cashbookPayFood}
              </Button>
            </div>
          </>
        )}
      </section>
      <section
        className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5"
        aria-label={t.cashbookMonthly}
      >
        <h2 className="text-xl font-semibold">{t.cashbookMonthly}</h2>
        <form action="/cashbook" method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="view" value="payments" />
          {data.filters.from && <input type="hidden" name="from" value={data.filters.from} />}
          {data.filters.to && <input type="hidden" name="to" value={data.filters.to} />}
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            {t.cashbookMonth}
            <Input
              type="month"
              name="month"
              defaultValue={data.filters.month.slice(0, 7)}
              required
            />
          </label>
          <Button variant="outline" type="submit">
            {t.cashbookApply}
          </Button>
        </form>
        {!monthly.length && <p className="text-sm text-muted-foreground">{t.cashbookNoMonthly}</p>}
        {monthly.map((row) => (
          <div key={row.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h3 className="font-semibold">{locale === 'es' ? row.name_es : row.name_en}</h3>
                <p className="text-sm text-muted-foreground">
                  {cashbookDay(row.period_month!, locale, true)} ·{' '}
                  {row.status === 'PAID' ? t.cashbookPaid : t.cashbookPending}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.cashbookDueDate}: {cashbookDay(row.effective_date, locale)}
                </p>
              </div>
              <strong className="tabular-nums">
                {row.status === 'PAID'
                  ? cashbookMoney(row.paid_amount_cents ?? 0, locale)
                  : row.amount_cents == null
                    ? '—'
                    : cashbookMoney(row.amount_cents, locale)}
              </strong>
            </div>
            {row.status === 'PENDING' ? (
              <div className="mt-3 grid gap-3">
                {paying === row.id ? (
                  <PaymentForm
                    locale={locale}
                    today={today}
                    rows={reviewedRows}
                    onClose={() => setPaying(null)}
                  />
                ) : editing === row.id ? (
                  <MonthlyEditForm locale={locale} row={row} onClose={() => setEditing(null)} />
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={Boolean(editing || paying)}
                      onClick={() => {
                        setReviewedRows([row]);
                        setPaying(row.id);
                      }}
                    >
                      {t.cashbookPay}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={Boolean(editing || paying)}
                      onClick={() => setEditing(row.id)}
                    >
                      {t.cashbookEditAmount}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {row.paid_at && (
                  <p>
                    {t.cashbookPaidOn}:{' '}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeZone: 'America/Belize',
                    }).format(new Date(row.paid_at))}
                  </p>
                )}
                <p className="break-all">
                  {t.cashbookPaidBy}: {row.paid_by_name ?? row.paid_by}
                </p>
                <a
                  className="min-h-11 py-2 underline"
                  href={`/cashbook?transaction=${row.paid_transaction_id}`}
                >
                  {t.cashbookLinkedPayment}
                </a>
              </div>
            )}
          </div>
        ))}
      </section>
      {paid.length > 0 && (
        <details className="rounded-2xl border bg-card p-4 sm:p-5">
          <summary className="min-h-12 cursor-pointer py-2 font-semibold">
            {t.cashbookPaidHistory}
          </summary>
          <div className="pt-3">
            <CashbookFoodLines rows={paid} locale={locale} />
          </div>
        </details>
      )}
    </div>
  );
}
