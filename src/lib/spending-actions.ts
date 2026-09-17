'use server';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { can } from './domain';
import { supabase } from './supabase/server';
import { authAdmin } from './supabase/admin';
import { spendingSchema, receiptSchema, spendingPath, MAX_RECEIPT_BYTES } from './spending-domain';
import { validateProcessedReceipt } from './receipt-image';
import type { ActionState } from './actions';

export async function recordSpending(_previous: ActionState, form: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const parsed = spendingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'SPENDING_INVALID' };
  const value = parsed.data;
  if (!can(profile.role, value.kind === 'EXPENSE' ? 'expenses.create' : 'purchases.capture'))
    return { error: 'FORBIDDEN' };
  const { error } = await (
    await supabase()
  ).rpc('record_spending', {
    p_id: value.requestId,
    p_kind: value.kind,
    p_category_id: value.categoryId,
    p_amount: value.amount, // Decimal string reaches PostgreSQL numeric without float arithmetic.
    p_currency: value.currency,
    p_location_id: value.locationId,
    p_paid_by: value.paidBy,
    p_payment_method: value.paymentMethod,
    p_occurred_at: value.occurredAt,
    p_notes: value.notes,
  });
  if (error) {
    const known = ['FORBIDDEN', 'REQUEST_CONFLICT', 'SPENDING_INVALID'] as const;
    return { error: known.find((key) => error.message.includes(key)) ?? 'SPENDING_UNKNOWN' };
  }
  revalidatePath('/expenses');
  redirect(spendingPath(value.requestId, value.kind));
}
export async function uploadReceipt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  if (!can(profile.role, 'receipts.upload')) return { error: 'FORBIDDEN' };
  const parsed = receiptSchema.safeParse(Object.fromEntries(form));
  const file = form.get('receipt');
  if (
    !parsed.success ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_RECEIPT_BYTES
  )
    return { error: 'RECEIPT_INVALID' };
  let bytes: Buffer;
  try {
    bytes = await validateProcessedReceipt(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { error: 'RECEIPT_INVALID' };
  }
  const value = parsed.data;
  const hash = createHash('sha256').update(bytes).digest('hex');
  const db = await supabase();
  const reservation = await db.rpc('reserve_receipt', {
    p_id: value.requestId,
    p_expense_id: value.kind === 'EXPENSE' ? value.parentId : null,
    p_purchase_id: value.kind === 'PURCHASE' ? value.parentId : null,
    p_sha256: hash,
    p_size: bytes.length,
  });
  if (reservation.error || !reservation.data)
    return {
      error: reservation.error?.message.includes('FORBIDDEN')
        ? 'FORBIDDEN'
        : reservation.error?.message.includes('REQUEST_CONFLICT')
          ? 'REQUEST_CONFLICT'
          : 'RECEIPT_UPLOAD_INCOMPLETE',
    };
  const path = reservation.data;
  const uploaded = await db.storage
    .from('receipts')
    .upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '0', upsert: false });
  if (uploaded.error) {
    // The previous attempt may have stored the object but lost its response.
    // Never overwrite; confirm identical bytes using the user's own read grant.
    const existing = await db.storage.from('receipts').download(path);
    if (
      existing.error ||
      !existing.data ||
      createHash('sha256')
        .update(Buffer.from(await existing.data.arrayBuffer()))
        .digest('hex') !== hash
    )
      return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  }
  const completed = await authAdmin().rpc('complete_receipt', {
    p_id: value.requestId,
    p_actor: profile.id,
  });
  if (completed.error) return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  revalidatePath('/expenses', 'layout');
  redirect(`${spendingPath(value.parentId, value.kind)}&receipt=1`);
}
