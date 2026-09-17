import { DocumentOpened } from '@/components/document-opened';
import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { getDocuments, documentPeople } from '@/lib/documents';
import { collect, validId } from '@/lib/inventory';
import { dictionary, type Key } from '@/lib/i18n';
import { DocumentForm } from '@/components/document-form';
import { PageHeader } from '@/components/page-header';
import { LocalTime } from '@/components/local-time';
import { documentExpiry } from '@/lib/document-domain';
import type { Json } from '@/lib/database.types';
export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale),
    { id } = await params;
  validId(id);
  const db = await supabase(),
    { data: d, error } = await db.from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('DOCUMENT_LOAD_FAILED');
  if (!d) notFound();
  const owner = p.role === 'OWNER',
    [people, docs, files, history] = await Promise.all([
      owner ? documentPeople() : [],
      owner ? getDocuments() : [],
      owner
        ? collect((a, b) =>
            db
              .from('document_files')
              .select('*')
              .eq('document_id', id)
              .order('created_at', { ascending: false })
              .order('id')
              .range(a, b),
          )
        : [],
      owner ? db.rpc('document_history', { p_id: id }) : { data: [], error: null },
    ]);
  if (history.error) throw new Error('DOCUMENT_HISTORY_FAILED');
  const name = (value: Json | undefined) =>
    people.find((x) => x.id === value)?.display_name ?? t.taskPreviousReference;
  const object = (v: Json | null) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const labels: Record<string, Key> = {
    title: 'docTitle',
    description: 'docDescription',
    category: 'docCategory',
    expiry_date: 'docExpiry',
    favorite: 'docLegacyPreference',
    archived: 'docArchived',
    access_level: 'docAccess',
    selected_users: 'docSelectPeople',
    current_file_id: 'docReplace',
    ready: 'docFileReady',
  };
  const value = (k: string, v: Json | undefined): string =>
    v === null || v === undefined || v === ''
      ? t.notSet
      : k === 'selected_users' && Array.isArray(v)
        ? v.map(name).join(', ')
        : k === 'access_level'
          ? t[`docAccess${v}` as Key]
          : typeof v === 'boolean'
            ? v
              ? t.docYes
              : t.docNo
            : k === 'current_file_id'
              ? t.docRevision.replace(
                  '{n}',
                  String(files.find((f) => f.id === v)?.base_version ?? '—'),
                )
              : String(v);
  const due = documentExpiry(d.expiry_date);
  return (
    <div className="page max-w-5xl">
      {!d.archived && d.current_file_id && <DocumentOpened userId={p.id} documentId={d.id} />}
      <PageHeader title={d.title} back="/documents" locale={locale} />
      {d.archived && <p className="mb-4 font-semibold">{t.docArchived}</p>}
      {d.description && <p className="mb-4 whitespace-pre-wrap">{d.description}</p>}
      {d.category && <p className="mb-4">{d.category}</p>}
      {d.current_file_id ? (
        <div className="mb-5 flex flex-wrap gap-3">
          <a
            className="min-h-14 rounded-xl bg-primary p-4 font-semibold text-primary-foreground"
            href={`/document-file/${id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.docOpen}
          </a>
          <a className="min-h-14 rounded-xl border p-4" href={`/document-file/${id}?download=1`}>
            {t.docDownload}
          </a>
        </div>
      ) : (
        <p>{t.docDraft}</p>
      )}
      {owner && (
        <>
          <p className="mb-3">
            {t.docUploadedBy}: {name(d.uploaded_by)}
            {d.uploaded_at && (
              <>
                {' '}
                · <LocalTime value={d.uploaded_at} locale={locale} />
              </>
            )}
          </p>
          <p className="mb-3">
            {t.docEditedBy}: {name(d.updated_by)} ·{' '}
            <LocalTime value={d.updated_at} locale={locale} />
          </p>
          {d.expiry_date && (
            <p className="mb-4">
              {due ? t[due] : t.docExpiry}: {d.expiry_date}
            </p>
          )}
          <details className="my-5 hidden rounded-xl border p-4 md:block">
            <summary className="min-h-12 cursor-pointer py-3 font-semibold">{t.docEdit}</summary>
            <DocumentForm
              locale={locale}
              id={id}
              requestId={crypto.randomUUID()}
              initial={d}
              people={people}
              categories={[...new Set(docs.map((x) => x.category).filter(Boolean))]}
            />
          </details>
          <details className="my-5 hidden rounded-xl border p-4 md:block">
            <summary className="min-h-12 cursor-pointer py-3 font-semibold">
              {t.docVersions}
            </summary>
            {files.map((f) => (
              <div className="border-t py-3" key={f.id}>
                <p>
                  {t.docRevision.replace('{n}', String(f.base_version))}
                  {f.id === d.current_file_id ? ` · ${t.docCurrent}` : ''}
                </p>
                <p>
                  {name(f.uploaded_by)} ·{' '}
                  <LocalTime locale={locale} value={f.uploaded_at ?? f.created_at} />
                </p>
                {f.ready ? (
                  <a
                    className="inline-flex min-h-12 items-center underline"
                    href={`/document-file/${id}?version=${f.id}&download=1`}
                  >
                    {t.docDownload}
                  </a>
                ) : (
                  <p>{t.docDraft}</p>
                )}
              </div>
            ))}
          </details>
          <details className="my-5 hidden rounded-xl border p-4 md:block">
            <summary className="min-h-12 cursor-pointer py-3 font-semibold">{t.docHistory}</summary>
            <p className="mb-3 text-sm">{t.taskHistoryLimit}</p>
            {history.data?.map((a) => {
              const before = object(a.before_data),
                after = object(a.after_data);
              return (
                <div key={a.id} className="border-t py-3">
                  <p>
                    {a.entity_type === 'document_files'
                      ? t.docRevision.replace('{n}', String(after.base_version ?? '—'))
                      : t.documents}{' '}
                    · {name(a.actor_id)} · <LocalTime locale={locale} value={a.created_at} />
                  </p>
                  {Object.entries(labels)
                    .filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
                    .map(([k, label]) => (
                      <p className="break-words text-sm" key={k}>
                        {t[label]}: {value(k, before[k])} → {value(k, after[k])}
                      </p>
                    ))}
                </div>
              );
            })}
          </details>
        </>
      )}
    </div>
  );
}
