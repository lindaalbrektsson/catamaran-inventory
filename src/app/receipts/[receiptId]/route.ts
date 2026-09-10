import { z } from 'zod';
import { getProfile } from '@/lib/auth';
import { can } from '@/lib/domain';
import { supabase } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const profile = await getProfile();
  if (!profile?.active || !can(profile.role, 'expenses.read'))
    return new Response(null, { status: 401, headers });
  const { receiptId } = await params;
  if (!z.uuid().safeParse(receiptId).success) return new Response(null, { status: 404, headers });
  const db = await supabase();
  const receipt = await db
    .from('receipts')
    .select('object_path')
    .eq('id', receiptId)
    .eq('status', 'READY')
    .maybeSingle();
  if (receipt.error || !receipt.data) return new Response(null, { status: 404, headers });
  const file = await db.storage.from('receipts').download(receipt.data.object_path);
  if (file.error || !file.data) return new Response(null, { status: 404, headers });
  return new Response(await file.data.arrayBuffer(), {
    headers: {
      ...headers,
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline; filename="receipt.jpg"',
    },
  });
}
