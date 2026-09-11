import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { LocalTime } from '@/components/local-time';
import { DesktopOnly } from '@/components/desktop-only';
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const p = await requireProfile();
  if (p.role !== 'OWNER') redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    search = await searchParams,
    db = await supabase();
  const page = /^[1-9]\d{0,4}$/.test(search.page ?? '') ? Number(search.page) : 1;
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * 20, page * 20);
  if (error) throw new Error('AUDIT_LOAD_FAILED');
  const ids = [...new Set(data.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
  const actors = ids.length
    ? await db.from('profiles').select('id,display_name').in('id', ids)
    : { data: [], error: null };
  if (actors.error) throw new Error('ACTORS_LOAD_FAILED');
  const names = new Map(actors.data?.map((p) => [p.id, p.display_name]));
  return (
    <DesktopOnly locale={locale}>
      <div className="page">
        <h1 className="mb-5 text-2xl font-semibold">{t.auditHistory}</h1>
        <Link className="mb-5 inline-flex underline" href="/inventory/overview">
          {t.ownerWorkspace}
        </Link>
        <div className="grid gap-4">
          {data.slice(0, 20).map((r) => (
            <article key={r.id} className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                {r.action} · {r.entity_type}
              </h2>
              <p>
                {r.actor_id ? (names.get(r.actor_id) ?? r.actor_id) : t.notSet} ·{' '}
                <LocalTime value={r.created_at} locale={locale} />
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {t.auditRecord}: {r.entity_id}
              </p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2">
                  {t.auditBefore} / {t.auditAfter}
                </summary>
                <div className="grid gap-3 lg:grid-cols-2">
                  {[
                    [t.auditBefore, r.before_data],
                    [t.auditAfter, r.after_data],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <h3 className="font-medium">{String(label)}</h3>
                      <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
        {!data.length && <p>{t.noActivity}</p>}
        <div className="mt-5 flex gap-5">
          {page > 1 && <Link href={`/inventory/audit?page=${page - 1}`}>{t.previous}</Link>}
          {data.length > 20 && <Link href={`/inventory/audit?page=${page + 1}`}>{t.next}</Link>}
        </div>
      </div>
    </DesktopOnly>
  );
}
