'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { changeStock } from '@/lib/actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { type Reason, can, type Role } from '@/lib/domain';
import { Button } from './ui/button';
import { QuantityField } from './quantity-field';
import { Label } from './ui/label';
import { usePreservedForm } from './use-preserved-form';
export function StockForm({
  locale,
  productId,
  locationId,
  mode,
  requestId,
  role,
}: {
  locale: Locale;
  productId: string;
  locationId: string;
  mode: 'add' | 'remove';
  requestId: string;
  role: Role;
}) {
  const [state, action, pending] = useActionState(changeStock, {}),
    t = dictionary(locale);
  const [stableRequestId] = useState(requestId);
  const choices: Reason[] =
    mode === 'add'
      ? ['other', 'returned', 'correction']
      : can(role, 'inventory.remove')
        ? ['other', 'tour', 'damaged', 'lost', 'staff']
        : ['tour'];
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<Reason>(choices[0]);
  const [notes, setNotes] = useState('');
  const formRef = usePreservedForm();
  return (
    <form ref={formRef} action={action} className="grid gap-6">
      <input type="hidden" name="requestId" value={stableRequestId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="mode" value={mode} />
      <QuantityField
        locale={locale}
        value={quantity}
        onChange={setQuantity}
        invalid={Boolean(state.fields?.quantity)}
        disabled={pending}
      />
      {mode === 'add' ? (
        <input type="hidden" name="reason" value="other" />
      ) : (
        <div className="field">
          <Label htmlFor="reason">{t.reason}</Label>
          <select
            disabled={pending}
            id="reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value as Reason)}
            required
            aria-invalid={Boolean(state.fields?.reason)}
            aria-describedby={state.fields?.reason ? 'reason-error' : undefined}
          >
            {choices.map((reason) => (
              <option value={reason} key={reason}>
                {t[reason]}
              </option>
            ))}
          </select>
          {state.fields?.reason && (
            <p id="reason-error" className="text-xs text-destructive">
              {t[state.fields.reason]}
            </p>
          )}
        </div>
      )}
      <details className="rounded-xl border p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t.addNotes}</summary>
        <div className="field">
          <Label htmlFor="notes">
            {t.notes} <span className="font-normal text-muted-foreground">({t.optional})</span>
          </Label>
          <textarea
            disabled={pending}
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t.notesHint}
            aria-invalid={Boolean(state.fields?.notes)}
            aria-describedby={state.fields?.notes ? 'notes-error' : undefined}
          />
          {state.fields?.notes && (
            <p id="notes-error" className="text-xs text-destructive">
              {t[state.fields.notes]}
            </p>
          )}
        </div>
      </details>
      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {t[state.error]}
        </p>
      )}
      <div className="stock-actions grid grid-cols-[1fr_2fr] gap-3">
        <Button variant="outline" asChild>
          <Link href={`/inventory/${locationId}/${productId}`}>{t.cancel}</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
