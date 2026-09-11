'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { validateOriginalReceipt, normalizeReceipt } from './receipt-image';
import type { ActionState } from './actions';
import type { Key } from './i18n';
export async function reverseStock(request: string, original: string): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  if (!z.uuid().safeParse(request).success || !z.uuid().safeParse(original).success)
    return { error: 'INVALID_INPUT' };
  const { error } = await (
    await supabase()
  ).rpc('reverse_stock', { p_request: request, p_original: original });
  if (error) {
    const keys: Key[] = [
      'FORBIDDEN',
      'INSUFFICIENT_STOCK',
      'ALREADY_REVERSED',
      'REVERSAL_INVALID',
      'REQUEST_CONFLICT',
    ];
    return { error: keys.find((k) => error.message.includes(k)) ?? 'UNKNOWN' };
  }
  revalidatePath('/inventory', 'layout');
  return {};
}
export async function captureSimpleReceipt(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const parsed = z
    .object({
      requestId: z.uuid(),
      receiptType: z.enum(['FUEL', 'STORE']),
      payment: z.enum(['CASH', 'CARD', 'CREDIT']),
    })
    .safeParse(Object.fromEntries(form));
  const file = form.get('receipt');
  if (!parsed.success || !(file instanceof File) || file.size > 3145728 || !file.size)
    return { error: 'RECEIPT_INVALID' };
  let bytes: Buffer;
  try {
    bytes = await normalizeReceipt(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { error: 'RECEIPT_INVALID' };
  }
  const v = parsed.data,
    db = await supabase(),
    hash = createHash('sha256').update(bytes).digest('hex');
  const reserve = await db.rpc('capture_receipt', {
    p_id: v.requestId,
    p_type: v.receiptType,
    p_payment: v.payment,
    p_hash: hash,
    p_size: bytes.length,
  });
  if (reserve.error || !reserve.data)
    return {
      error: reserve.error?.message.includes('REQUEST_CONFLICT')
        ? 'REQUEST_CONFLICT'
        : 'RECEIPT_UPLOAD_INCOMPLETE',
    };
  const upload = await db.storage
    .from('receipts')
    .upload(reserve.data, bytes, { contentType: 'image/jpeg', cacheControl: '0', upsert: false });
  if (upload.error) {
    const existing = await db.storage.from('receipts').download(reserve.data);
    if (
      existing.error ||
      !existing.data ||
      createHash('sha256')
        .update(Buffer.from(await existing.data.arrayBuffer()))
        .digest('hex') !== hash
    )
      return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  }
  const completed = await db.rpc('complete_intake', { p_id: v.requestId });
  if (completed.error) return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  revalidatePath('/expenses', 'layout');
  redirect('/expenses?saved=1');
}
export async function reviewReceipt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const p = await requireProfile();
  if (p.role !== 'OWNER') return { error: 'FORBIDDEN' };
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(['NEW', 'REVIEWED', 'ARCHIVED']),
      supplier: z.string().trim().max(200),
      amount: z
        .string()
        .trim()
        .transform((v) => v.replace(',', '.'))
        .pipe(z.string().regex(/^(?:\d{1,12}(?:\.\d{1,2})?)?$/)),
      currency: z.enum(['BZD', 'USD']),
      category: z.string().max(200),
      notes: z.string().max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'SPENDING_INVALID' };
  const { id, status, ...details } = parsed.data;
  const { error } = await (
    await supabase()
  ).rpc('review_intake', { p_id: id, p_status: status, p_details: details });
  if (error) return { error: 'UNKNOWN' };
  revalidatePath('/expenses', 'layout');
  redirect('/expenses');
}

export async function prepareOriginalReceipt(input: {
  id: string;
  type: string;
  payment: string;
  hash: string;
  size: number;
  mime: string;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' as const };
  const parsed = z
    .object({
      id: z.uuid(),
      type: z.enum(['FUEL', 'STORE']),
      payment: z.enum(['CASH', 'CARD', 'CREDIT']),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().min(1).max(20971520),
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    })
    .safeParse(input);
  if (!parsed.success) return { error: 'RECEIPT_INVALID' as const };
  const v = parsed.data,
    db = await supabase();
  const reserved = await db.rpc('reserve_original_receipt', {
    p_id: v.id,
    p_type: v.type,
    p_payment: v.payment,
    p_hash: v.hash,
    p_size: v.size,
    p_mime: v.mime,
  });
  if (reserved.error || !reserved.data) return { error: 'RECEIPT_UPLOAD_INCOMPLETE' as const };
  return { path: reserved.data };
}
export async function finishOriginalReceipt(id: string): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role) || !z.uuid().safeParse(id).success)
    return { error: 'FORBIDDEN' };
  const db = await supabase();
  const { data: r } = await db
    .from('receipt_intake')
    .select('*')
    .eq('id', id)
    .eq('uploaded_by', p.id)
    .single();
  if (!r || !r.original_preserved) return { error: 'RECEIPT_INVALID' };
  const file = await db.storage.from('receipts').download(r.object_path);
  if (file.error || !file.data) return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (
    bytes.length !== r.byte_size ||
    createHash('sha256').update(bytes).digest('hex') !== r.content_sha256
  )
    return { error: 'RECEIPT_INVALID' };
  try {
    await validateOriginalReceipt(bytes, r.content_type);
  } catch {
    return { error: 'RECEIPT_INVALID' };
  }
  const done = await db.rpc('complete_intake', { p_id: id });
  if (done.error) return { error: 'RECEIPT_UPLOAD_INCOMPLETE' };
  revalidatePath('/expenses', 'layout');
  redirect('/expenses?saved=1');
}
