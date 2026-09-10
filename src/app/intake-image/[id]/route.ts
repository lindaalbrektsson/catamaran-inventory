import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    p = await getProfile();
  if (!p?.active || !['OWNER', 'MANAGER'].includes(p.role))
    return new Response(null, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase();
  const r = await db
    .from('receipt_intake')
    .select('object_path')
    .eq('id', id)
    .eq('upload_ready', true)
    .maybeSingle();
  if (r.error || !r.data) return new Response(null, { status: 404, headers });
  const file = await db.storage.from('receipts').download(r.data.object_path);
  if (file.error || !file.data) return new Response(null, { status: 404, headers });
  return new Response(await file.data.arrayBuffer(), {
    headers: { ...headers, 'Content-Type': 'image/jpeg' },
  });
}
