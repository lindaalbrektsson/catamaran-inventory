'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { transferStock } from '@/lib/actions';
import { dictionary, type Locale } from '@/lib/i18n';
import type { Location } from '@/lib/database.types';
import { QuantityField } from './quantity-field';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { usePreservedForm } from './use-preserved-form';

export function TransferForm({
  locale,
  productId,
  sourceId,
  destinations,
  requestId,
}: {
  locale: Locale;
  productId: string;
  sourceId: string;
  destinations: Location[];
  requestId: string;
}) {
  const t = dictionary(locale);
  const [state, action, pending] = useActionState(transferStock, {});
  const [stableRequestId] = useState(requestId);
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const formRef = usePreservedForm();
  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <input type="hidden" name="requestId" value={stableRequestId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <div className="field">
        <Label htmlFor="destination">{t.destination}</Label>
        <select
          id="destination"
          name="destinationId"
          value={destination}
          disabled={pending}
          required
          onChange={(event) => setDestination(event.target.value)}
        >
          <option value="" disabled>
            {t.chooseDestination}
          </option>
          {destinations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <QuantityField locale={locale} value={quantity} onChange={setQuantity} disabled={pending} />
      <details className="rounded-xl border p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t.addNotes}</summary>
        <Label htmlFor="notes">
          {t.notes} ({t.optional})
        </Label>
        <textarea
          id="notes"
          name="notes"
          value={notes}
          disabled={pending}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={1000}
        />
      </details>
      <p className="text-sm leading-6 text-muted-foreground">{t.transferHint}</p>
      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          {t[state.error]}
        </p>
      )}
      <div className="stock-actions grid grid-cols-[1fr_2fr] gap-3">
        <Button variant="outline" asChild>
          <Link href={`/inventory/${sourceId}/${productId}`}>{t.cancel}</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.transfer}
        </Button>
      </div>
    </form>
  );
}
