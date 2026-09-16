import { readTaskUpdates } from '@/lib/task-update-history';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const data = await readTaskUpdates({
      task: q.get('task'),
      occurrence: q.get('occurrence'),
      before: q.has('before') ? { at: q.get('before'), id: q.get('id') } : null,
    });
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return Response.json(
      { error: 'UPDATES_LOAD_FAILED' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
