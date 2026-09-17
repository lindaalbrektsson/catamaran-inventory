'use client';
import Image from 'next/image';
import { useActionState, useEffect, useRef, useState } from 'react';
import { uploadReceipt } from '@/lib/spending-actions';
import { uploadOriginalReceipt } from '@/lib/original-upload';
import { dictionary, type Locale } from '@/lib/i18n';
import { type SpendingKind } from '@/lib/spending-domain';
import { usePreservedForm } from './use-preserved-form';
import { processReceiptImage } from '@/lib/receipt-image-client';
import { SlowOperationNotice } from './slow-operation-notice';
import { Button } from './ui/button';

export function ReceiptUploader({
  locale,
  kind,
  parentId,
  requestId,
  intakeType,
}: {
  locale: Locale;
  kind: SpendingKind;
  parentId: string;
  requestId: string;
  intakeType?: 'FUEL' | 'STORE';
}) {
  const t = dictionary(locale),
    formRef = usePreservedForm();
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'uploading' | 'checking'>('uploading');
  const [state, action, pending] = useActionState(
    intakeType
      ? (previous, form: FormData) => uploadOriginalReceipt(previous, form, setStage)
      : uploadReceipt,
    {},
  );
  const [id, setId] = useState(requestId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [processing, setProcessing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function choose(selected?: File) {
    if (!selected) return;
    setProcessing(true);
    setInvalid(false);
    setFile(null);
    setPreview('');
    try {
      const normalized = await processReceiptImage(selected);
      setFile(normalized);
      setPreview(URL.createObjectURL(normalized));
      setId(crypto.randomUUID());
    } catch {
      setInvalid(true);
    } finally {
      setProcessing(false);
    }
  }
  return (
    <form
      ref={formRef}
      action={(data) => {
        if (file) data.set('receipt', file);
        action(data);
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="requestId" value={id} />
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="kind" value={kind} />
      {intakeType && <input type="hidden" name="receiptType" value={intakeType} />}
      <input
        ref={camera}
        aria-label={t.takePhoto}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        disabled={pending || processing}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={gallery}
        aria-label={t.uploadImage}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={pending || processing}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending || processing}
          onClick={() => camera.current?.click()}
        >
          {t.takePhoto}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || processing}
          onClick={() => gallery.current?.click()}
        >
          {t.uploadImage}
        </Button>
      </div>
      {!intakeType && <p className="text-xs leading-5 text-muted-foreground">{t.receiptHint}</p>}
      {processing && (
        <p role="status" className="text-sm">
          {t.receiptProcessing}
        </p>
      )}
      {preview && (
        <Image
          unoptimized
          src={preview}
          alt={t.receiptPreview}
          width={600}
          height={800}
          className="max-h-80 w-full rounded-xl border object-contain"
        />
      )}
      {(invalid || state.error) && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          {invalid ? t.RECEIPT_INVALID : state.error ? t[state.error] : ''}
        </p>
      )}
      {intakeType && (
        <fieldset className="grid gap-3" disabled={pending || processing}>
          <legend className="mb-3 font-medium">{t.paymentMethod}</legend>
          {(['CASH', 'CARD', 'CREDIT'] as const).map((method) => (
            <label key={method} className="flex min-h-14 items-center gap-3 rounded-xl border p-4">
              <input
                type="radio"
                name="payment"
                value={method}
                required
                onChange={() => setId(crypto.randomUUID())}
              />
              {t[method]}
            </label>
          ))}
        </fieldset>
      )}
      <SlowOperationNotice pending={pending} locale={locale} />
      <Button type="submit" disabled={!file || pending || processing}>
        {pending
          ? intakeType
            ? stage === 'checking'
              ? t.uploadChecking
              : t.docUploading
            : t.saving
          : t.uploadReceipt}
      </Button>
      {!intakeType && <p className="text-xs text-muted-foreground">{t.receiptPrivate}</p>}
    </form>
  );
}
