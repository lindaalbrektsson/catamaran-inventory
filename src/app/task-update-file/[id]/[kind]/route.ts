import { getProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import type { UpdateFile } from '@/lib/database.types';
import { z } from 'zod';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Accept-Ranges': 'bytes',
    },
    p = await getProfile();
  if (!p?.active || !['OWNER', 'MANAGER'].includes(p.role))
    return new Response(null, { status: 401, headers });
  const { id, kind } = await params;
  if (!z.uuid().safeParse(id).success || !['photo', 'voice'].includes(kind))
    return new Response(null, { status: 404, headers });
  const db = await supabase(),
    { data: u } = await db
      .from('task_updates')
      .select('*')
      .eq('id', id)
      .eq('ready', true)
      .maybeSingle();
  const file = u?.[kind as 'photo' | 'voice'] as UpdateFile | null;
  if (!file) return new Response(null, { status: 404, headers });
  const { data, error } = await db.storage.from('task-update-files').download(`${id}/${kind}`);
  if (error || !data) return new Response(null, { status: 404, headers });
  const common = { ...headers, 'Content-Type': file.content_type, 'Content-Disposition': 'inline' };
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = 0,
      end = data.size - 1;
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { ...common, 'Content-Range': `bytes */${data.size}` },
      });
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    } else start = Math.max(0, data.size - Number(match[2]));
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= data.size
    )
      return new Response(null, {
        status: 416,
        headers: { ...common, 'Content-Range': `bytes */${data.size}` },
      });
    return new Response(data.slice(start, end + 1).stream(), {
      status: 206,
      headers: {
        ...common,
        'Content-Range': `bytes ${start}-${end}/${data.size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  return new Response(data.stream(), {
    headers: { ...common, 'Content-Length': String(data.size) },
  });
}
