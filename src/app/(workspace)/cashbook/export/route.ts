import { getProfile, getLocale } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { cashbookWorkbook } from '@/lib/cashbook-excel';
import { cashbookDateRange } from '@/lib/cashbook-domain';
import { dictionary } from '@/lib/i18n';
import { z } from 'zod';

export const runtime = 'nodejs';
const account = z.enum(['CASH', 'ACCOUNT']).nullable();
const kind = z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'OPENING', 'PAYMENT', 'REVERSAL']);
const cents = z.union([z.number().int().safe(), z.string().regex(/^-?\d+$/)]);
const snapshot = z.object({
  transactions: z.array(
    z.object({
      id: z.uuid(),
      kind,
      effective_date: z.string(),
      amount_cents: cents,
      source_account: account,
      destination_account: account,
      comment: z.string(),
      created_by: z.uuid(),
      created_at: z.string(),
      reverses_transaction_id: z.uuid().nullable(),
      correction_of: z.uuid().nullable(),
      status: z.enum(['POSTED', 'VOIDED', 'CORRECTED']),
      original_kind: kind.nullable(),
      creator_name: z.string().nullable(),
      payment_reference: z.string().nullable(),
      related_transaction_ids: z.array(z.uuid()).optional(),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.uuid(),
      transaction_id: z.uuid(),
      account: z.enum(['CASH', 'ACCOUNT']),
      amount_cents: cents,
    }),
  ),
});
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!profile?.active || profile.role !== 'OWNER') return new Response(null, { status: 403 });
  const locale = await getLocale(),
    t = dictionary(locale);
  const params = new URL(request.url).searchParams;
  let range: { from: string; to: string };
  try {
    range = cashbookDateRange(params.get('from') ?? '', params.get('to') ?? '');
  } catch {
    return new Response(t.cashbookInvalid, { status: 400 });
  }
  try {
    // One database snapshot includes all pre-period legs needed for opening balances.
    // No separate offset scans that could drift during a concurrent posting.
    const { data, error } = await (await supabase()).rpc('cashbook_report', { p_to: range.to });
    if (error) throw new Error('CASHBOOK_EXPORT_FAILED');
    const report = snapshot.parse(data);
    const bytes = await cashbookWorkbook({ role: profile.role, locale, ...range, ...report });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cashbook-${range.from}-${range.to}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response(t.cashbookError, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
