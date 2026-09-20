'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveNeed } from '@/lib/quick-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import type { ItemCatalog } from '@/lib/item-domain';
import type { PurchaseNeed } from '@/lib/database.types';
import { usePreservedForm } from './use-preserved-form';
import { Button } from './ui/button';
import { StatusBadge } from './status-badge';
import { NeedItemPicker } from './need-item-picker';
export function NeedForm({
  locale,
  catalog,
  id,
  requestId,
  initial,
  suggestion,
}: {
  locale: Locale;
  catalog: ItemCatalog;
  id: string;
  requestId: string;
  initial?: PurchaseNeed;
  suggestion?: { name: string; product_id: string };
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(saveNeed, {}),
    [request, setRequest] = useState(requestId),
    [productId, setProductId] = useState(initial?.product_id ?? suggestion?.product_id ?? ''),
    ref = usePreservedForm(),
    c = 'min-h-12 w-full rounded-xl border bg-background p-3';
  const existing = catalog.needs?.find((n) => n.product_id === productId && n.id !== id);
  return (
    <form
      ref={ref}
      action={action}
      className="grid max-w-xl gap-4"
      onChange={() => setRequest(crypto.randomUUID())}
    >
      <input type="hidden" name="requestId" value={request} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={initial?.version ?? 0} />
      <NeedItemPicker
        catalog={catalog}
        locale={locale}
        productId={productId}
        name={initial?.name ?? suggestion?.name ?? ''}
        onProduct={(id) => {
          setProductId(id);
          setRequest(crypto.randomUUID());
        }}
      />
      {existing && (
        <Link
          role="status"
          className="grid gap-2 rounded-xl border-2 border-primary/30 bg-secondary p-4 font-medium"
          href={`/needs/${existing.id}`}
        >
          <span>{t.usabilityNeedExists}</span>
          <StatusBadge tone={existing.status === 'PENDING' ? 'attention' : 'active'}>
            {existing.status === 'PENDING' ? t.needPending : t.ORDERED}
          </StatusBadge>
          <span className="underline">{t.needOpen}</span>
        </Link>
      )}
      <label className="grid gap-2">
        {t.needCountry}
        <select className={c} name="country" defaultValue={initial?.country ?? 'BELIZE'}>
          <option value="BELIZE">{t.BELIZE}</option>
          <option value="USA">{t.USA}</option>
        </select>
      </label>
      <label className="grid gap-2">
        {t.usabilityNeedQuantity} ({t.optional})
        <input
          className={c}
          name="quantity_needed"
          inputMode="decimal"
          maxLength={15}
          pattern="(?:0|[1-9][0-9]{0,10})(?:[.,][0-9]{1,3})?"
          defaultValue={initial?.quantity_needed ?? ''}
        />
        {catalog.products.find((p) => p.id === productId) && (
          <span className="text-sm text-muted-foreground">
            {t[catalog.products.find((p) => p.id === productId)!.unit]}
          </span>
        )}
      </label>
      <details className="rounded-xl border p-3">
        <summary className="min-h-12 cursor-pointer py-3">{t.needOptional}</summary>
        <div className="grid gap-4">
          <label className="grid gap-2">
            {t.needLink}
            <input
              className={c}
              name="product_url"
              type="url"
              maxLength={2000}
              defaultValue={initial?.product_url}
            />
          </label>
          <label className="grid gap-2">
            {t.needComment}
            <textarea
              className={c}
              name="comment"
              maxLength={2000}
              defaultValue={initial?.comment}
              spellCheck
              lang={locale}
            />
          </label>
          {!initial?.photo_ready && (
            <label className="grid gap-2">
              {t.needPhoto}
              <input
                className={c}
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
              />
              <span className="text-sm">{t.needPhotoHint}</span>
            </label>
          )}
        </div>
      </details>
      {initial ? (
        <label className="grid gap-2">
          {t.needStatus}
          <select className={c} name="status" defaultValue={initial?.status ?? 'PENDING'}>
            <option value="PENDING">{t.needPending}</option>
            <option value="ORDERED">{t.ORDERED}</option>
            <option value="DONE">{t.DONE}</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="status" value="PENDING" />
      )}
      {state.error === 'DUPLICATE_NEED' && !productId && (
        <label className="flex min-h-12 items-center gap-3">
          <input name="confirmDuplicate" type="checkbox" />
          {t.needDuplicateConfirm}
        </label>
      )}
      {state.error && <p role="alert">{t[state.error]}</p>}
      {state.existingNeed && (
        <Link className="min-h-12 underline" href={`/needs/${state.existingNeed}`}>
          {t.needOpen}
        </Link>
      )}
      {state.error === 'needPhotoRetry' && (
        <Link href={`/needs/${id}`} className="min-h-12 underline">
          {t.needEdit}
        </Link>
      )}
      <Button disabled={pending || (!!existing && initial?.status !== 'DONE')}>
        {pending ? t.saving : t.needSave}
      </Button>
    </form>
  );
}
