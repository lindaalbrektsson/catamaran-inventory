'use client';

import { useActionState, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { mutateCashbook } from '@/lib/cashbook-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { minorToInput } from '@/lib/cashbook-domain';
import { usePreservedForm } from './use-preserved-form';
import { SlowOperationNotice } from './slow-operation-notice';
import { Button } from './ui/button';
import { Input } from './ui/input';

export const cashbookControl = 'min-h-12 w-full rounded-xl border bg-background p-3';

export function cashbookMoney(value: number | string, locale: Locale) {
  return new Intl.NumberFormat(locale === 'es' ? 'es-BZ' : 'en-BZ', {
    style: 'currency',
    currency: 'BZD',
    currencyDisplay: 'code',
  }).format(Number(value) / 100);
}

// Date-only business fields must not pass through the browser's local time zone.
export function cashbookDay(value: string, locale: Locale, month = false) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...(month
      ? { month: 'long' as const, year: 'numeric' as const }
      : {
          weekday: 'long' as const,
          day: 'numeric' as const,
          month: 'short' as const,
          year: 'numeric' as const,
        }),
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export function CashbookForm({
  locale,
  operation,
  title,
  children,
  onSaved,
  onCancel,
  submitLabel,
  className = '',
}: {
  locale: Locale;
  operation: string;
  title: string;
  children: ReactNode;
  onSaved?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  className?: string;
}) {
  const t = dictionary(locale),
    router = useRouter(),
    formRef = usePreservedForm();
  const request = useRef<string | null>(null);
  const submitted = useRef<FormData | null>(null);
  const submissionLock = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof mutateCashbook>>, data: FormData) => {
      request.current ??= crypto.randomUUID();
      const payload = uncertain && submitted.current ? submitted.current : data;
      payload.set('requestId', request.current);
      submitted.current = payload;
      try {
        const result = await mutateCashbook(previous, payload);
        setUncertain(Boolean(result.uncertain));
        if (result.success) {
          request.current = null;
          router.refresh();
          onSaved?.();
        }
        return result;
      } catch {
        setUncertain(true);
        return { error: 'cashbookUncertain' as const };
      } finally {
        submissionLock.current = false;
      }
    },
    {},
  );
  return (
    <form
      ref={formRef}
      action={action}
      aria-label={title}
      onSubmit={(event) => {
        if (submissionLock.current) event.preventDefault();
        else submissionLock.current = true;
      }}
      onChange={() => {
        if (!pending && !uncertain) request.current = null;
      }}
      className={`grid gap-4 rounded-2xl border bg-card p-4 sm:p-5 ${className}`}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <input type="hidden" name="action" value={operation} />
      <fieldset disabled={pending || uncertain} className="grid min-w-0 gap-4">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
          {t[state.error]}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-secondary p-3 text-sm">
          {t.cashbookSaved}
        </p>
      )}
      <SlowOperationNotice pending={pending} locale={locale} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} className="min-h-12 flex-1">
          {pending ? t.saving : uncertain ? t.cashbookRetry : (submitLabel ?? t.cashbookSave)}
        </Button>
        {onCancel && (
          <Button
            type="button"
            disabled={pending || uncertain}
            variant="outline"
            className="min-h-12"
            onClick={onCancel}
          >
            {t.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

export function CashbookAmount({
  name = 'amount',
  label,
  value,
  onChange,
  defaultCents,
  allowZero = false,
  required = true,
  readOnly = false,
}: {
  name?: string;
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  defaultCents?: number | string | null;
  allowZero?: boolean;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      <Input
        name={name}
        type="number"
        inputMode="decimal"
        min={allowZero ? '0' : '0.01'}
        max="9999999999.99"
        step="0.01"
        required={required}
        readOnly={readOnly}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        defaultValue={
          value === undefined && defaultCents != null ? minorToInput(defaultCents) : undefined
        }
      />
    </label>
  );
}

export function CashbookAccountField({
  locale,
  name,
  label,
  value,
  onChange,
  defaultValue = 'CASH',
  exclude,
}: {
  locale: Locale;
  name: string;
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  exclude?: string;
}) {
  const t = dictionary(locale);
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      <select
        name={name}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        required
        className={cashbookControl}
      >
        {(['CASH', 'ACCOUNT'] as const)
          .filter((account) => account !== exclude)
          .map((account) => (
            <option key={account} value={account}>
              {account === 'CASH' ? t.cashbookCash : t.cashbookAccount}
            </option>
          ))}
      </select>
    </label>
  );
}

export function CashbookDateField({
  locale,
  today,
  name = 'effective_date',
}: {
  locale: Locale;
  today: string;
  name?: string;
}) {
  const t = dictionary(locale);
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {t.cashbookDate}
      <Input type="date" name={name} defaultValue={today} required />
    </label>
  );
}

export function CashbookComment({
  locale,
  defaultValue = '',
  required = false,
  name = 'comment',
  label,
}: {
  locale: Locale;
  defaultValue?: string;
  required?: boolean;
  name?: string;
  label?: string;
}) {
  const t = dictionary(locale);
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label ?? t.cashbookComment}
      {!required && ` (${t.optional})`}
      <textarea
        name={name}
        rows={2}
        maxLength={1000}
        defaultValue={defaultValue}
        required={required}
        lang={locale}
      />
    </label>
  );
}

export function CashbookConfirmation({ label }: { label: string }) {
  return (
    <label className="flex min-h-12 items-start gap-3 rounded-xl bg-secondary p-3 text-sm">
      <input type="checkbox" name="confirmed" className="mt-1 size-5 shrink-0" required />
      {label}
    </label>
  );
}
