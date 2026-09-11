import { createBrowserClient } from '@supabase/ssr';

const id = '10000000-0000-4000-8000-000000000001';
const user = { id, aud: 'authenticated' };
const token = () =>
  `e30.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
const client = createBrowserClient('https://session-test.supabase.co', 'test-public', {
  global: {
    fetch: async (input) => {
      if (String(input).includes('/logout')) return Response.json({});
      if (String(input).includes('/token'))
        return Response.json({
          access_token: token(),
          refresh_token: 'test-rotated',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        });
      return Response.json(user);
    },
  },
});
Object.assign(window, {
  sessionTest: {
    login: () =>
      client.auth.signInWithPassword({ phone: '+5010000000', password: 'isolated-test-only' }),
    signedIn: async () => Boolean((await client.auth.getSession()).data.session),
    refresh: () => client.auth.refreshSession(),
    logout: () => client.auth.signOut(),
  },
});
