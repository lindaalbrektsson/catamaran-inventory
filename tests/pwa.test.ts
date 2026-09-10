import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://coral.test';
const source = readFileSync('src/pwa/worker.js', 'utf8').replace('__VERSION__', 'test');
type WorkerEvent = {
  request?: Request;
  waitUntil: (value: Promise<unknown>) => void;
  respondWith: (value: Promise<Response>) => void;
};
function harness() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (value: string | Request) =>
    new URL(typeof value === 'string' ? value : value.url, origin).href;
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (request: string | Request, response: Response) => {
          store.set(key(request), response.clone());
        },
        match: async (request: string | Request) => store.get(key(request))?.clone(),
      };
    }),
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const fetch = vi.fn(async () => new Response('public asset'));
  const self = {
    location: { origin },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (name: string, callback: (event: WorkerEvent) => void) =>
      handlers.set(name, callback),
  };
  class RelativeRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, origin), init);
    }
  }
  vm.runInNewContext(source, {
    self,
    caches,
    fetch,
    Request: RelativeRequest,
    Response,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  async function dispatch(name: string, request?: Request) {
    let response: Promise<Response> | undefined;
    const tasks: Promise<unknown>[] = [];
    handlers.get(name)!({
      request,
      waitUntil: (task) => tasks.push(task),
      respondWith: (task) => {
        response = task;
      },
    });
    await Promise.all(tasks);
    return response;
  }
  return { stores, fetch, self, caches, dispatch };
}
function request(path: string, init?: RequestInit, navigation = false) {
  const result = new Request(new URL(path, origin), init);
  if (navigation) Object.defineProperty(result, 'mode', { value: 'navigate' });
  return result;
}

describe('public-only PWA worker', () => {
  it('precaches only the explicit public allowlist, without cookies', async () => {
    const h = harness();
    await h.dispatch('install');
    const keys = [...h.stores.get('coral-public-test')!.keys()];
    expect(keys).toHaveLength(8);
    expect(
      keys.every((value) =>
        /^\/(offline\.(html|js)|icon\.svg|icon-(192|512|maskable-512)\.png|apple-icon\.png|favicon\.png)$/.test(
          new URL(value).pathname,
        ),
      ),
    ).toBe(true);
    for (const [input] of h.fetch.mock.calls as unknown as [Request][])
      expect(input.credentials).toBe('omit');
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
  });
  it('never intercepts mutations or cross-origin Supabase requests', async () => {
    const h = harness();
    expect(
      await h.dispatch('fetch', request('/inventory', { method: 'POST', body: 'private' })),
    ).toBeUndefined();
    expect(
      await h.dispatch('fetch', request('https://example.supabase.co/rest/v1/inventory_balances')),
    ).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.caches.open).not.toHaveBeenCalled();
  });
  it.each([
    '/inventory',
    '/login',
    '/api/profile',
    '/inventory?_rsc=abc',
    '/icon.svg?private=1',
    '/receipts/private-id',
    '/expenses/private-id',
  ])('does not store sensitive GET response for %s', async (path) => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response('private data'));
    await h.dispatch('fetch', request(path));
    expect(h.fetch).toHaveBeenCalledWith(expect.anything(), { cache: 'no-store' });
    expect(h.caches.open).not.toHaveBeenCalled();
  });
  it('never serves the HTML offline fallback for RSC or server-action requests', async () => {
    const h = harness();
    await h.dispatch('install');
    h.fetch.mockRejectedValue(new Error('offline'));
    for (const headers of [
      { RSC: '1' },
      { Accept: 'text/x-component' },
      { 'Next-Action': 'action' },
    ] as HeadersInit[]) {
      await expect(h.dispatch('fetch', request('/icon.svg', { headers }))).rejects.toThrow(
        'offline',
      );
    }
  });
  it('returns only the public offline page with 503 for a failed navigation', async () => {
    const h = harness();
    await h.dispatch('install');
    h.fetch.mockRejectedValue(new Error('offline'));
    const result = await h.dispatch('fetch', request('/inventory/private-id', {}, true));
    expect(result?.status).toBe(503);
    expect(result?.headers.get('Cache-Control')).toBe('no-store');
    expect(await result?.text()).toBe('public asset');
    expect(h.stores.get('coral-public-test')!.size).toBe(8);
  });
  it('preserves live navigation responses and does not cache private HTML or errors', async () => {
    const h = harness();
    for (const status of [200, 401, 500]) {
      h.fetch.mockResolvedValue(new Response('private html', { status }));
      expect((await h.dispatch('fetch', request('/inventory', {}, true)))?.status).toBe(status);
    }
    expect(h.caches.open).not.toHaveBeenCalled();
  });
  it('cleans only its old public caches on activation', async () => {
    const h = harness();
    await h.caches.open('unrelated-cache');
    await h.caches.open('coral-public-old');
    await h.caches.open('coral-public-test');
    await h.dispatch('activate');
    expect(await h.caches.keys()).toEqual(['unrelated-cache', 'coral-public-test']);
    expect(h.self.clients.claim).toHaveBeenCalledOnce();
  });
});
