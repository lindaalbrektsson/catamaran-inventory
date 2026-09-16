import { timingSafeEqual } from 'node:crypto';
import { dispatchDuePush } from '@/lib/push-dispatch';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET;
  const a = Buffer.from(request.headers.get('authorization') || ''),
    b = Buffer.from(`Bearer ${secret || ''}`);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response(null, { status: 401 });
  try {
    return Response.json(await dispatchDuePush(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'PUSH_DISPATCH_FAILED' }, { status: 503 });
  }
}
