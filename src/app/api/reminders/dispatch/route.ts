import { cleanTestStorage } from '@/lib/test-storage-cleanup';
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
    const cleanup = cleanTestStorage(10).catch(() => 0);
    const push = await dispatchDuePush();
    await cleanup;
    return Response.json(push, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'PUSH_DISPATCH_FAILED' }, { status: 503 });
  }
}
