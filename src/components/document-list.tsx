'use client';
import { useState } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { documentExpiry } from '@/lib/document-domain';
import type { OperationalDocument } from '@/lib/database.types';
export function DocumentList({
  documents,
  locale,
  owner = false,
  canUpload = owner,
  home = false,
  now,
}: {
  documents: OperationalDocument[];
  locale: Locale;
  owner?: boolean;
  canUpload?: boolean;
  home?: boolean;
  now: string;
}) {
  const t = dictionary(locale),
    [search, setSearch] = useState(''),
    [favorite, setFavorite] = useState(false),
    [archived, setArchived] = useState(false),
    [category, setCategory] = useState(''),
    [expiry, setExpiry] = useState(false),
    c = 'min-h-12 rounded-xl border bg-background p-3';
  const list = documents.filter((d) =>
    home
      ? d.favorite && !d.archived && !!d.current_file_id
      : d.archived === archived &&
        (!favorite || d.favorite) &&
        (!category || d.category === category) &&
        (!expiry || documentExpiry(d.expiry_date, new Date(now))) &&
        (d.title + ' ' + d.description)
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale)),
  );
  return (
    <section className={home ? 'mt-4 rounded-2xl border bg-card p-5' : ''} aria-label={t.documents}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {home ? (
          <h2 className="text-xl font-semibold">{t.docHome}</h2>
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
      {!home && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2">
            {t.docSearch}
            <input
              type="search"
              className={c}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
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
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
              />
              {t.docFavorites}
            </label>
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
              href={home ? `/document-file/${d.id}` : `/documents/${d.id}`}
              target={home ? '_blank' : undefined}
              rel={home ? 'noopener noreferrer' : undefined}
              className="block min-h-14 rounded-xl border p-4"
            >
              <h3 className="break-words font-semibold">
                {d.favorite && <span aria-label={t.docFavorite}>★ </span>}
                {d.title}
              </h3>
              {!home && (
                <>
                  {d.category && <p className="mt-1 text-sm">{d.category}</p>}
                  {!d.current_file_id && <p className="mt-2 text-sm">{t.docDraft}</p>}
                  {owner && d.expiry_date && (
                    <p className="mt-2 text-sm">
                      {due ? t[due] : t.docExpiry}: {d.expiry_date}
                    </p>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </div>
      {!list.length && (
        <p className="py-3 text-muted-foreground">{home ? t.docNoFavorites : t.docEmpty}</p>
      )}
      {home && (
        <Link className="mt-3 inline-flex min-h-12 items-center underline" href="/documents">
          {t.docSeeAll}
        </Link>
      )}
    </section>
  );
}
