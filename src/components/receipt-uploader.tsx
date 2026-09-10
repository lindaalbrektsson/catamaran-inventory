'use client';
import Image from 'next/image';
import { useActionState, useEffect, useRef, useState } from 'react';
import { uploadReceipt } from '@/lib/spending-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { MAX_RECEIPT_BYTES, type SpendingKind } from '@/lib/spending-domain';
import { usePreservedForm } from './use-preserved-form';
import { Button } from './ui/button';

export function ReceiptUploader({
  locale,
  kind,
  parentId,
  requestId,
}: {
  locale: Locale;
  kind: SpendingKind;
  parentId: string;
  requestId: string;
}) {
  const t = dictionary(locale),
    formRef = usePreservedForm();
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(uploadReceipt, {});
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
    let bitmap: ImageBitmap | undefined;
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
        selected.size > 20 * 1024 * 1024
      )
        throw new Error('INVALID');
      bitmap = await createImageBitmap(selected);
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('INVALID');
      const scale = Math.min(1, 2400 / bitmap.width, 4000 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('INVALID');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      );
      if (!blob || blob.size > MAX_RECEIPT_BYTES) throw new Error('INVALID');
      const normalized = new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
      setFile(normalized);
      setPreview(URL.createObjectURL(normalized));
      setId(crypto.randomUUID());
    } catch {
      setInvalid(true);
    } finally {
      bitmap?.close();
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
      <input
        ref={camera}
        aria-label={t.takePhoto}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
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
        className="sr-only"
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
      <p className="text-xs leading-5 text-muted-foreground">{t.receiptHint}</p>
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
      <Button type="submit" disabled={!file || pending || processing}>
        {pending ? t.saving : t.uploadReceipt}
      </Button>
      <p className="text-xs text-muted-foreground">{t.receiptPrivate}</p>
    </form>
  );
}
