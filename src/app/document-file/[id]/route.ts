import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { documentExtension, documentMimes } from '@/lib/document-domain';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
    p = await getProfile();
  if (!p?.active) return new Response(null, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase(),
    { data: d, error } = await db
      .from('documents')
      .select('current_file_id,title')
      .eq('id', id)
      .maybeSingle();
  if (error || !d?.current_file_id) return new Response(null, { status: 404, headers });
  const requested = new URL(request.url).searchParams.get('version'),
    fileId = p.role === 'OWNER' && requested ? requested : d.current_file_id;
  if (!z.uuid().safeParse(fileId).success) return new Response(null, { status: 404, headers });
  const { data: f } = await db
    .from('document_files')
    .select('*')
    .eq('id', fileId)
    .eq('document_id', id)
    .eq('ready', true)
    .maybeSingle();
  if (!f || !documentMimes.includes(f.content_type as (typeof documentMimes)[number]))
    return new Response(null, { status: 404, headers });
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) return new Response(null, { status: 401, headers });
  // Stream bytes; do not expose tokens or mint shareable signed URLs. Storage
  // independently checks the same current document permissions for every read.
  const remote = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/documents/${f.object_path}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
      cache: 'no-store',
    },
  );
  if (!remote.ok || !remote.body) return new Response(null, { status: 404, headers });
  const filename = encodeURIComponent(d.title + '.' + documentExtension(f.content_type)).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16),
  );
  return new Response(remote.body, {
    headers: {
      ...headers,
      'Content-Type': f.content_type,
      'Content-Disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="document-${id}.${documentExtension(f.content_type)}"; filename*=UTF-8''${filename}`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
