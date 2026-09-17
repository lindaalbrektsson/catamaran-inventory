import { uploadOnce } from './upload-once';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { prepareOriginalReceipt, finishOriginalReceipt } from './operational-actions';
import type { ActionState } from './actions';
export async function uploadOriginalReceipt(
  _previous: ActionState,
  form: FormData,
  stage?: (value: 'uploading' | 'checking') => void,
): Promise<ActionState> {
  const file = form.get('receipt');
  if (!(file instanceof File)) return { error: 'RECEIPT_INVALID' };
  const id = String(form.get('requestId'));
  // Reconcile a previous uncertain attempt before sending any bytes again.
  if (_previous.error) {
    stage?.('checking');
    const existing = await finishOriginalReceipt(id);
    if (!existing.error || existing.error === 'RECEIPT_INVALID') return existing;
  }
  try {
    const bytes = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    const reservation = await prepareOriginalReceipt({
      id,
      type: String(form.get('receiptType')),
      payment: String(form.get('payment')),
      hash,
      size: file.size,
      mime: file.type,
    });
    if (reservation.error || !reservation.path)
      return { error: reservation.error ?? 'RECEIPT_UPLOAD_INCOMPLETE' };
    const db = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    // Direct authenticated Storage upload avoids the hosting provider's request body limit.
    // Never overwrite; finish verifies bytes/hash and supports retries after a lost response.
    stage?.('uploading');
    await uploadOnce('receipts/' + reservation.path + '/' + hash, () =>
      db.storage.from('receipts').upload(reservation.path!, file, {
        contentType: file.type,
        cacheControl: '0',
        upsert: false,
      }),
    );
  } catch {
    // Storage may have accepted bytes before the response was lost. Reconcile
    // using this same request; never automatically repeat the upload.
  }
  stage?.('checking');
  return finishOriginalReceipt(id);
}
