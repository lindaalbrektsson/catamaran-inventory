'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { transferStock } from '@/lib/actions';
import { dictionary, number, type Locale } from '@/lib/i18n';
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
  source,
  unit,
}: {
  locale: Locale;
  productId: string;
  sourceId: string;
  destinations: (Location & { quantity?: number })[];
  source?: Location & { quantity: number };
  unit?: string;
  requestId: string;
}) {
  const t = dictionary(locale);
  const [state, action, pending] = useActionState(transferStock, {});
  const [stableRequestId] = useState(requestId);
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState(
    destinations.length === 1 ? destinations[0].id : '',
  );
  const [notes, setNotes] = useState('');
  const formRef = usePreservedForm();
  const target = destinations.find((l) => l.id === destination);
  const amount = Number(quantity.replace(',', '.'));
  const preview =
    source &&
    target?.quantity != null &&
    /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(quantity) &&
    amount > 0 &&
    amount <= source.quantity;
  return (
    <form ref={formRef} action={action} className="grid gap-6">
      <input type="hidden" name="requestId" value={stableRequestId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="sourceId" value={sourceId} />
      {source && (
        <div data-location={source.type} className="location-header rounded-xl border p-4">
          <span className="text-sm">{t.source}</span>
          <p className="font-semibold">{source.name}</p>
          <p>
            {t.currentStock}: {number(source.quantity, locale)} {unit}
          </p>
        </div>
      )}
      {destinations.length === 1 ? (
        <div data-location={destinations[0].type} className="location-header rounded-xl border p-4">
          <span className="text-sm">{t.destination}</span>
          <p className="font-semibold">{destinations[0].name}</p>
          {target?.quantity != null && (
            <p>
              {t.currentStock}: {number(target.quantity, locale)} {unit}
            </p>
          )}
          <input type="hidden" name="destinationId" value={destination} />
        </div>
      ) : (
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
      )}
      <QuantityField
        shortcuts={[1, 2, 3, 4]}
        showHint={false}
        invalid={state.error === 'INVALID_INPUT'}
        locale={locale}
        value={quantity}
        onChange={setQuantity}
        disabled={pending}
      />
      {destinations.length > 1 && target?.quantity != null && (
        <p>
          {target.name}: {number(target.quantity, locale)} {unit}
        </p>
      )}
      {preview && (
        <div role="status" className="rounded-xl bg-secondary p-3">
          <p className="font-semibold">{t.usabilityAfterTransfer}</p>
          <p>
            {source!.name} {number(Math.round((source!.quantity - amount) * 1000) / 1000, locale)} ·{' '}
            {target!.name} {number(Math.round((target!.quantity! + amount) * 1000) / 1000, locale)}
          </p>
        </div>
      )}
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

      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          {t[state.error]}
        </p>
      )}
      <div className="grid grid-cols-[1fr_2fr] gap-3">
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
