import 'server-only';

type Operation =
  | 'auth.claims'
  | 'profile.load'
  | 'locations.list'
  | 'location.load'
  | 'inventory.balances'
  | 'inventory.catalog'
  | 'needs.summary'
  | 'needs.inventory'
  | 'route.staff'
  | 'staff.list'
  | 'tasks.summary'
  | 'documents.list'
  | 'route.home'
  | 'route.location';

// Static operation labels only. Never serialize arguments, results or exceptions.
export async function timed<T>(operation: Operation, read: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  let failed = false;
  try {
    const result = await read();
    failed = !!(result && typeof result === 'object' && 'error' in result && result.error);
    return result;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (process.env.PERFORMANCE_LOGGING === '1') {
      console.info(
        JSON.stringify({
          event: 'server_timing',
          operation,
          duration_ms: Math.round(performance.now() - start),
          outcome: failed ? 'error' : 'ok',
        }),
      );
    }
  }
}
