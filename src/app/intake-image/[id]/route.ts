import { receiptImagePolicy } from '@/lib/receipt-response';
import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import sharp from 'sharp';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    p = await getProfile();
  if (!p?.active || !['OWNER', 'MANAGER'].includes(p.role))
    return new Response(null, { status: 401, headers });
  const url = new URL(request.url);
  if (url.searchParams.has('download') && p.role !== 'OWNER')
    return new Response(null, { status: 403, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const db = await supabase();
  const r = await db
    .from('receipt_intake')
    .select('object_path,content_type')
    .eq('id', id)
    .eq('upload_ready', true)
    .maybeSingle();
  if (r.error || !r.data) return new Response(null, { status: 404, headers });
  const file = await db.storage.from('receipts').download(r.data.object_path);
  if (file.error || !file.data) return new Response(null, { status: 404, headers });
  const bytes = await file.data.arrayBuffer();
  if (url.searchParams.has('thumb')) {
    try {
      const preview = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 240, height: 320, fit: 'inside' })
        .jpeg()
        .toBuffer();
      return new Response(new Uint8Array(preview), {
        headers: { ...headers, 'Content-Type': 'image/jpeg' },
      });
    } catch {
      return new Response(null, { status: 422, headers });
    }
  }
  const ext =
    r.data.content_type === 'image/png'
      ? 'png'
      : r.data.content_type === 'image/webp'
        ? 'webp'
        : 'jpg';
  return new Response(bytes, {
    headers: {
      ...headers,
      'Content-Type': r.data.content_type,
      'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="receipt-${id}.${ext}"`,
      'Content-Security-Policy': receiptImagePolicy,
    },
  });
}
