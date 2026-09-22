'use client';
import { TestBadge } from '@/components/test-badge';
import { EmptyState } from './empty-state';
import { FileText } from 'lucide-react';
import { SearchField } from './search-field';
import { useState, useSyncExternalStore } from 'react';
import {
  recordDocumentOpen,
  documentUsageSnapshot,
  subscribeDocumentUsage,
  frequentDocuments,
} from '@/lib/document-usage';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { documentExpiry } from '@/lib/document-domain';
import { compactDate } from '@/lib/list-presentation';
import type { OperationalDocument } from '@/lib/database.types';
export function DocumentList({
  documents,
  locale,
  owner = false,
  canUpload = owner,
  home = false,
  now,
  userId = '',
}: {
  documents: OperationalDocument[];
  locale: Locale;
  owner?: boolean;
  canUpload?: boolean;
  home?: boolean;
  now: string;
  userId?: string;
}) {
  const t = dictionary(locale),
    [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false),
    [category, setCategory] = useState(''),
    [expiry, setExpiry] = useState(false),
    c = 'min-h-12 rounded-xl border bg-background p-3';
  const list = documents.filter((d) =>
    home
      ? !d.archived && !!d.current_file_id
      : d.archived === archived &&
        (!category || d.category === category) &&
        (!expiry || documentExpiry(d.expiry_date, new Date(now))) &&
        (d.title + ' ' + d.description)
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale)),
  );
  const usage = useSyncExternalStore(
    subscribeDocumentUsage,
    () => documentUsageSnapshot(userId),
    () => '{}',
  );
  const frequent = frequentDocuments(documents, usage);
  return (
    <section className={home ? 'mt-4 rounded-2xl border bg-card p-5' : ''} aria-label={t.documents}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {home ? (
          <h2 className="flex items-center gap-3 text-xl font-semibold">
            <span className="domain-mark">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            {t.documents}
          </h2>
        ) : (
          <h1 className="text-2xl font-semibold">{t.documents}</h1>
        )}
        {canUpload && !home && (
          <Link
            className="inline-flex min-h-12 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
            href="/documents/new"
          >
            {t.docUpload}
          </Link>
        )}
      </div>
      {!home && !archived && !search && !category && !expiry && frequent.length > 0 && (
        <section className="mb-5" aria-label={t.docFrequentlyUsed}>
          <h2 className="mb-2 font-semibold">{t.docFrequentlyUsed}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {frequent.map((d) => (
              <Link
                key={d.id}
                prefetch={false}
                href={`/documents/${d.id}`}
                className="flex min-h-12 items-center rounded-xl border p-3"
              >
                {d.title} <TestBadge value={d.is_test} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {!home && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="self-end">
            <SearchField label={t.docSearch} value={search} onChange={setSearch} />
          </div>
          <label className="grid gap-2">
            {t.docCategory}
            <select className={c} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t.taskAll}</option>
              {[...new Set(documents.map((d) => d.category).filter(Boolean))].sort().map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-12 items-center gap-2">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              {t.docArchived}
            </label>
            {owner && (
              <label className="hidden min-h-12 items-center gap-2 md:flex">
                <input
                  type="checkbox"
                  checked={expiry}
                  onChange={(e) => setExpiry(e.target.checked)}
                />
                {t.docExpiryFilter}
              </label>
            )}
          </div>
        </div>
      )}
      <div className={home ? 'grid gap-2' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'}>
        {(home ? list.slice(0, 5) : list).map((d) => {
          const due = documentExpiry(d.expiry_date, new Date(now));
          return (
            <Link
              key={d.id}
              prefetch={false}
              href={home ? `/document-file/${d.id}` : `/documents/${d.id}`}
              onClick={home ? () => recordDocumentOpen(userId, d.id) : undefined}
              target={home ? '_blank' : undefined}
              rel={home ? 'noopener noreferrer' : undefined}
              className="block min-h-14 rounded-xl border p-4"
            >
              <h3 className="break-words font-semibold">
                {d.title} <TestBadge value={d.is_test} />
              </h3>
              {!home && (
                <>
                  {d.category && <p className="mt-1 text-sm">{d.category}</p>}
                  {!d.current_file_id && <p className="mt-2 text-sm">{t.docDraft}</p>}
                  {owner && d.expiry_date && (
                    <p className="mt-2 text-sm">
                      {due ? t[due] : t.docExpiry}:{' '}
                      <time dateTime={d.expiry_date}>{compactDate(d.expiry_date, locale)}</time>
                    </p>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </div>
      {!list.length && <EmptyState domain="documents" title={t.docEmpty} />}
      {home && (
        <Link className="mt-3 inline-flex min-h-12 items-center underline" href="/documents">
          {t.docSeeAll}
        </Link>
      )}
    </section>
  );
}
