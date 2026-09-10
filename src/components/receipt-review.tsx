'use client';
import { useActionState } from 'react';
import { reviewReceipt } from '@/lib/operational-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { usePreservedForm } from './use-preserved-form';
export function ReceiptReview({
  id,
  status,
  details,
  locale,
}: {
  id: string;
  status: string;
  details: Record<string, string>;
  locale: Locale;
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(reviewReceipt, {}),
    ref = usePreservedForm();
  return (
    <form ref={ref} action={action} className="hidden max-w-lg gap-4 md:grid">
      <input type="hidden" name="id" value={id} />
      <label>
        {t.reviewStatus}
        <select name="status" defaultValue={status} disabled={pending}>
          {(['NEW', 'REVIEWED', 'ARCHIVED'] as const).map((s) => (
            <option key={s} value={s}>
              {t[s]}
            </option>
          ))}
        </select>
      </label>
      {(['supplier', 'amount', 'category', 'notes'] as const).map((key) => (
        <label key={key}>
          {t[key]}
          <input
            name={key}
            defaultValue={details[key] ?? ''}
            maxLength={key === 'notes' ? 1000 : 200}
            disabled={pending}
          />
        </label>
      ))}
      <label>
        {t.currency}
        <select name="currency" defaultValue={details.currency ?? 'BZD'} disabled={pending}>
          {(['BZD', 'USD'] as const).map((c) => (
            <option key={c} value={c}>
              {t[c]}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p role="alert">{t[state.error]}</p>}
      <Button disabled={pending}>{pending ? t.saving : t.saveReview}</Button>
    </form>
  );
}
