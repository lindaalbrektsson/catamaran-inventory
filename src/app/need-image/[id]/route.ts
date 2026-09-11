import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { z } from 'zod';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getProfile();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  if (!p?.active) return new Response(null, { status: 401, headers });
  if (!['OWNER', 'MANAGER'].includes(p.role)) return new Response(null, { status: 403, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase();
  const { data: n, error } = await db
    .from('purchase_needs')
    .select('photo_path,photo_ready')
    .eq('id', id)
    .maybeSingle();
  if (error) return new Response(null, { status: 500, headers });
  if (!n?.photo_ready || !n.photo_path) return new Response(null, { status: 404, headers });
  const file = await db.storage.from('need-photos').download(n.photo_path);
  if (file.error || !file.data) return new Response(null, { status: 404, headers });
  return new Response(await file.data.arrayBuffer(), {
    headers: { ...headers, 'Content-Type': 'image/jpeg' },
  });
}
