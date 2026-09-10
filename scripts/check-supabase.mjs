// Read-only connectivity check. Never log environment values, headers, bodies or errors.
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
console.log('NEXT_PUBLIC_SUPABASE_URL:', url ? 'present' : 'missing');
console.log('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:', key ? 'present' : 'missing');
if (!url || !key) process.exit(1);
try {
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) {
    console.log('Hosted project URL format: unexpected');
    process.exit(1);
  }
  const headers = { apikey: key };
  const auth = await fetch(new URL('/auth/v1/settings', base), {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  console.log('Auth settings endpoint: HTTP', auth.status);
  const inventory = await fetch(
    new URL('/rest/v1/inventory_balances?select=product_id&limit=0', base),
    {
      headers,
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await inventory.json();
  console.log('Unauthenticated inventory endpoint: HTTP', inventory.status);
  if (result?.code === 'PGRST205')
    console.log('Inventory schema: not available in the API schema cache');
  else if (result?.code === '42501')
    console.log('Inventory schema: endpoint denies anonymous access');
  else if (inventory.ok)
    console.log('Inventory schema: endpoint responds; grants require further inspection');
  else console.log('Inventory schema: inconclusive; no response details logged');
} catch {
  console.log(
    'Connectivity check failed; details intentionally suppressed to protect configuration.',
  );
  process.exitCode = 1;
}
