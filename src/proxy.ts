import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { config as supabaseConfig, isConfigured } from '@/lib/supabase/config';
import type { Database } from '@/lib/database.types';
import { timed } from '@/lib/performance';
export async function proxy(request: NextRequest) {
  if (!isConfigured()) return NextResponse.next();
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  await timed('auth.proxy', () => client.auth.getClaims());
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-icon.png|manifest.webmanifest|sw.js|offline.html|offline.js).*)',
  ],
};
