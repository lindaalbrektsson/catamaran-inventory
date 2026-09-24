'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { cashbookInput } from './cashbook-input';
import { hasCashbookAccess } from './cashbook';
import type { Key } from './i18n';
import type { CashbookDue } from './cashbook-types';
import { z } from 'zod';

export type CashbookActionState = {
  success?: boolean;
  error?: Key;
  uncertain?: boolean;
  id?: string;
};
export async function mutateCashbook(
  _previous: CashbookActionState,
  form: FormData,
): Promise<CashbookActionState> {
  const profile = await requireProfile();
  let input: ReturnType<typeof cashbookInput>;
  try {
    input = cashbookInput(form);
  } catch {
    return { error: 'cashbookInvalid' };
  }
  if (input.p_action === 'SAVE_TEMPLATE' && profile.role !== 'OWNER')
    return { error: 'cashbookAccessDenied' };
  const db = await supabase();
  // RPC checks active credentials + Cashbook membership itself under the session JWT.
  // A transport error may happen AFTER commit. The client must retain the request ID.
  let result: Awaited<ReturnType<typeof db.rpc<'cashbook_mutate'>>>;
  try {
    result = await db.rpc('cashbook_mutate', input);
  } catch {
    return { error: 'cashbookUncertain', uncertain: true };
  }
  if (result.error) {
    if (result.status >= 500 || !result.status || result.status === 408)
      return { error: 'cashbookUncertain', uncertain: true };
    const message = result.error.message;
    if (message.includes('FORBIDDEN')) return { error: 'cashbookAccessDenied' };
    if (/STALE|CONFLICT|ALREADY|OPENING_EXISTS|NOT_FOUND|AMOUNT_CHANGED/.test(message))
      return { error: 'cashbookConflict' };
    return { error: 'cashbookInvalid' };
  }
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data))
    return { error: 'cashbookUncertain', uncertain: true };
  revalidatePath('/cashbook');
  revalidatePath('/');
  return { success: true, id: typeof result.data.id === 'string' ? result.data.id : undefined };
}

export async function cashbookPaymentDetails(
  id: string,
): Promise<{ dues: CashbookDue[] } | { error: Key }> {
  await requireProfile();
  if (!z.uuid().safeParse(id).success) return { error: 'cashbookInvalid' };
  try {
    if (!(await hasCashbookAccess())) return { error: 'cashbookAccessDenied' };
    const db = await supabase();
    const result = await db.rpc('cashbook_payment_details', { p_id: id });
    if (result.error) return { error: 'cashbookError' };
    // Read the immutable payment snapshot, not a debt subsequently edited/repaid.
    const dues = z
      .array(
        z.object({
          id: z.uuid(),
          template_id: z.uuid(),
          kind: z.enum(['FOOD', 'MONTHLY']),
          name_en: z.string(),
          name_es: z.string(),
          effective_date: z.string(),
          period_month: z.string().nullable(),
          quantity: z.number().nullable(),
          unit_amount_cents: z.number().int().safe().nullable(),
          amount_cents: z.number().int().safe().nullable(),
          comment: z.string(),
          created_by: z.string().nullable(),
          created_at: z.string(),
          updated_at: z.string(),
          version: z.number().int(),
          status: z.enum(['PENDING', 'PAID']),
          paid_transaction_id: z.string().nullable(),
          paid_amount_cents: z.number().int().safe().nullable(),
          paid_at: z.string().nullable(),
          paid_by: z.string().nullable(),
          creator_name: z.string().nullable().optional(),
          paid_by_name: z.string().nullable().optional(),
        }),
      )
      .parse(result.data);
    return { dues };
  } catch {
    return { error: 'cashbookError' };
  }
}
