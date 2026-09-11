import { expect, it } from 'vitest';
import { createBrowserClient } from '@supabase/ssr';

// Isolated Auth transport: no production users, credentials or sessions.
it('persists rotated sessions across client restarts and clears them on explicit logout', async () => {
  const jar = new Map<string, string>();
  const expirations: number[] = [];
  let refreshes = 0;
  const user = { id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated' };
  const token = () =>
    `e30.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  const client = () =>
    createBrowserClient('https://session-test.supabase.co', 'test-public', {
      isSingleton: false,
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) => {
          for (const { name, value, options } of values) {
            if (value) {
              jar.set(name, value);
              expirations.push(options.maxAge ?? 0);
            } else jar.delete(name);
          }
        },
      },
      global: {
        fetch: async (input) => {
          const url = String(input);
          if (url.includes('/logout')) return new Response('{}', { status: 200 });
          if (url.includes('/token')) {
            refreshes++;
            return Response.json({
              access_token: token(),
              refresh_token: `rotated-${refreshes}`,
              expires_in: 3600,
              token_type: 'bearer',
              user,
            });
          }
          return Response.json(user);
        },
      },
    });
  const first = client();
  expect(
    (await first.auth.setSession({ access_token: token(), refresh_token: 'initial-test' })).error,
  ).toBeNull();
  expect(expirations.every((age) => age > 86400)).toBe(true);
  expect((await client().auth.getSession()).data.session?.user.id).toBe(user.id);
  expect((await first.auth.refreshSession()).error).toBeNull();
  expect((await client().auth.getSession()).data.session?.refresh_token).toBe('rotated-1');
  await first.auth.signOut();
  expect((await client().auth.getSession()).data.session).toBeNull();
  expect(jar.size).toBe(0);
});
