// Prints only the match result, never the URL, project ref or public key.
import { existsSync, readFileSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const linked = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const matches = url.protocol === 'https:' && url.hostname === `${linked}.supabase.co`;
  console.log(
    matches
      ? 'Linked project matches .env.local.'
      : 'STOP: linked project does not match .env.local.',
  );
  if (!matches) process.exitCode = 1;
} catch {
  console.log('STOP: link is missing or configuration cannot be verified.');
  process.exitCode = 1;
}
