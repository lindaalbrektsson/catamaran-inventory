'use client';
import { useActionState, useState } from 'react';
import { recoverUpload } from '@/lib/upload-recovery';
import type { ActionState } from '@/lib/actions';
import { uploadReceipt } from '@/lib/spending-actions';
import { uploadOriginalReceipt } from '@/lib/original-upload';
import { dictionary, type Locale } from '@/lib/i18n';
import { type SpendingKind } from '@/lib/spending-domain';
import { usePreservedForm } from './use-preserved-form';
import { MediaPicker } from './media-picker';
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
  const [stage, setStage] = useState<'uploading' | 'checking'>('uploading');
  const [state, action, pending] = useActionState(
    (previous: ActionState, form: FormData) =>
      recoverUpload<ActionState>(
        () =>
          intakeType
            ? uploadOriginalReceipt(previous, form, setStage)
            : uploadReceipt(previous, form),
        { error: 'RECEIPT_UPLOAD_INCOMPLETE' },
      ),
    {},
  );
  const [id, setId] = useState(requestId);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
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
      <MediaPicker
        locale={locale}
        value={file}
        onChange={(value) => {
          setFile(value);
          setId(crypto.randomUUID());
        }}
        profile="receipt"
        disabled={pending}
        onBusy={setProcessing}
      />
      {!intakeType && <p className="text-xs leading-5 text-muted-foreground">{t.receiptHint}</p>}
      {state.error && <p role="alert">{t[state.error]}</p>}
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
