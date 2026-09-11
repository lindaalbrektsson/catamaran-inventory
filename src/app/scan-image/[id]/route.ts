import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  const p = await getProfile();
  if (!p?.active) return new Response(null, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase(),
    { data: s } = await db
      .from('smart_scans')
      .select('object_path,content_type')
      .eq('id', id)
      .single();
  if (!s) return new Response(null, { status: 404, headers });
  const { data, error } = await db.storage.from('smart-scans').download(s.object_path);
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(data, {
    headers: { ...headers, 'Content-Type': s.content_type, 'Content-Disposition': 'inline' },
  });
}
