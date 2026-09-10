'use client';
import { useActionState, useState } from 'react';
import { recordSpending } from '@/lib/spending-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { paymentMethods, type SpendingKind } from '@/lib/spending-domain';
import type { Category, Location } from '@/lib/database.types';
import { usePreservedForm } from './use-preserved-form';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function SpendingForm({
  locale,
  kind,
  requestId,
  locations,
  categories,
  people,
  currentUser,
}: {
  locale: Locale;
  kind: SpendingKind;
  requestId: string;
  locations: Location[];
  categories: Category[];
  people: { id: string; display_name: string }[];
  currentUser: string;
}) {
  const t = dictionary(locale),
    formRef = usePreservedForm();
  const [state, action, pending] = useActionState(recordSpending, {});
  const [id] = useState(requestId);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('BZD');
  const [location, setLocation] = useState('');
  const [payer, setPayer] = useState(currentUser);
  const [method, setMethod] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const timestamp =
    date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toISOString() : '';
  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <input type="hidden" name="requestId" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="occurredAt" value={timestamp} />
      {kind === 'PURCHASE' && (
        <p className="rounded-xl bg-secondary p-4 text-sm text-primary">{t.purchaseDraftHint}</p>
      )}
      <div className="field">
        <Label htmlFor="expense-category">{t.category}</Label>
        <select
          id="expense-category"
          name="categoryId"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          required
          disabled={pending}
        >
          <option value="" disabled>
            {t.chooseOption}
          </option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {locale === 'es' ? item.name_es : item.name_en}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <div className="field">
          <Label htmlFor="amount">{t.amount}</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
            required
            disabled={pending}
            maxLength={15}
            pattern="(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?"
          />
        </div>
        <div className="field">
          <Label htmlFor="currency">{t.currency}</Label>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            disabled={pending}
          >
            {(['BZD', 'USD'] as const).map((code) => (
              <option key={code} value={code}>
                {t[code]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <Label htmlFor="expense-location">{t.location}</Label>
        <select
          id="expense-location"
          name="locationId"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          required
          disabled={pending}
        >
          <option value="" disabled>
            {t.chooseOption}
          </option>
          {locations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor="payer">{t.paidBy}</Label>
        <select
          id="payer"
          name="paidBy"
          value={payer}
          onChange={(event) => setPayer(event.target.value)}
          required
          disabled={pending}
        >
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor="payment-method">{t.paymentMethod}</Label>
        <select
          id="payment-method"
          name="paymentMethod"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          required
          disabled={pending}
        >
          <option value="" disabled>
            {t.chooseOption}
          </option>
          {paymentMethods.map((value) => (
            <option key={value} value={value}>
              {t[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <Label htmlFor="occurred-at">{t.occurredAt}</Label>
        <Input
          id="occurred-at"
          type="datetime-local"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
          disabled={pending}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            const now = new Date();
            setDate(
              new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
            );
          }}
        >
          {t.useNow}
        </Button>
      </div>
      <details className="rounded-xl border p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm">{t.addNotes}</summary>
        <Label htmlFor="expense-notes">
          {t.notes} ({t.optional})
        </Label>
        <textarea
          id="expense-notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          rows={3}
          disabled={pending}
        />
      </details>
      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          {t[state.error]}
        </p>
      )}
      <div className="stock-actions">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.saving : t.saveReceiptNext}
        </Button>
      </div>
    </form>
  );
}
