// Read-only hosted schema comparison. No Auth/stock writes and no credential output.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

process.loadEnvFile('.env.local');
const linked = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${linked}.supabase.co`) {
  console.log('STOP: linked project does not match configuration.');
  process.exit(1);
}
const directory = 'artifacts/supabase-verification';
mkdirSync(directory, { recursive: true });
const queryPath = `${directory}/readonly-query.sql`;
function remote(sql) {
  // SQL is supplied only by the checked-in verification queries below.
  writeFileSync(queryPath, sql);
  const result = spawnSync(
    'cmd.exe',
    ['/d', '/s', '/c', `npx supabase@2.117.0 db query --linked --file ${queryPath} --output json`],
    { encoding: 'utf8', input: '', timeout: 45000, windowsHide: true },
  );
  if (result.status !== 0) throw new Error('REMOTE_QUERY_FAILED');
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.rows)) throw new Error('UNEXPECTED_QUERY_RESPONSE');
  return parsed.rows;
}
const stable = (value) =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
const migrations = readdirSync('supabase/migrations')
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort()
  .map((file) => {
    const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file);
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    return { version, name, sql, sha256: createHash('sha256').update(sql).digest('hex') };
  });
const queries = (readFileSync('supabase/checks/verify.sql', 'utf8') + readFileSync('supabase/checks/receipts.sql', 'utf8'))
  .split(';')
  .map((q) => q.trim())
  .filter(Boolean);
const labels = [
  'tables and RLS',
  'RPCs and helpers (bodies, search paths, execute grants)',
  'RLS policies',
  'audit/immutability/timestamp triggers',
  'table grants',
  'indexes',
  'constraints',
  'Auth profile trigger',
  'columns, defaults and NOT NULL',
  'private receipt bucket',
  'receipt Storage policies',
];
const local = new PGlite();
const report = {
  checkedAt: new Date().toISOString(),
  migrations: migrations.map(({ version, name, sha256 }) => ({ version, name, sha256 })),
  checks: [],
};
try {
  await local.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await local.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant all on storage.objects to authenticated,anon;`);
  for (const migration of migrations) await local.exec(`begin;\n${migration.sql}\ncommit;`);
  const history = remote(
    'select version,name from supabase_migrations.schema_migrations order by version',
  );
  const historyPass =
    stable(history) === stable(migrations.map(({ version, name }) => ({ version, name })));
  report.checks.push({ label: 'migration history', pass: historyPass, count: history.length });
  console.log(`${historyPass ? 'PASS' : 'FAIL'} migration history: ${history.length} record(s)`);
  for (let index = 0; index < queries.length; index++) {
    const expected = (await local.query(queries[index])).rows;
    const actual = remote(queries[index]);
    const pass = stable(actual) === stable(expected);
    report.checks.push({ label: labels[index], pass, count: actual.length });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${labels[index]}: ${actual.length} object(s)`);
    // Schema metadata only; no configuration, account details, or operational records.
    if (!pass)
      writeFileSync(
        `${directory}/mismatch-${index}.json`,
        JSON.stringify({ expected, actual }, null, 2),
      );
  }
  const counts = remote(`select (select count(*) from public.locations)::int as locations,
    (select count(*) from public.products)::int as products,
    (select count(*) from public.inventory_balances)::int as balances,
    (select count(*) from public.inventory_transactions)::int as movements,
    (select count(*) from auth.users)::int as auth_users,
    (select count(*) from public.profiles where role='OWNER' and active)::int as active_owners`)[0];
  report.counts = counts;
  console.log('Operational/Auth counts (no record details):', JSON.stringify(counts));
  writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
  if (report.checks.some((check) => !check.pass)) process.exitCode = 1;
} catch {
  console.log('Verification could not complete; raw diagnostic output suppressed.');
  process.exitCode = 1;
} finally {
  await local.close();
}
