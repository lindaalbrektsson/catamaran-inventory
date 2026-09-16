import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { z } from 'zod';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
    p = await getProfile();
  if (!p?.active || !['OWNER', 'MANAGER'].includes(p.role))
    return new Response(null, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase(),
    { data: u } = await db
      .from('maintenance_updates')
      .select('*')
      .eq('id', id)
      .eq('photo_ready', true)
      .maybeSingle();
  if (!u?.photo_path || !['image/jpeg', 'image/png', 'image/webp'].includes(u.content_type ?? ''))
    return new Response(null, { status: 404, headers });
  const { data, error } = await db.storage.from('maintenance-photos').download(u.photo_path);
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(data, {
    headers: { ...headers, 'Content-Type': u.content_type!, 'Content-Disposition': 'inline' },
  });
}
