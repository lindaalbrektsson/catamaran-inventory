import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { extractionSchema, scanReviewSchema } from '@/lib/scan-domain';
import { itemCatalog } from '@/lib/item-catalog';
import { ScanReviewForm } from '@/components/scan-review';
import { LocalTime } from '@/components/local-time';
export const maxDuration = 60;
export default async function ScanDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await supabase(),
    { data: s } = await db.from('smart_scans').select('*').eq('id', id).single();
  if (!s) notFound();
  const locale = await getLocale(),
    t = dictionary(locale),
    parsed = extractionSchema.safeParse(s.original_result),
    reviewed = scanReviewSchema.safeParse(s.review);
  const { data: actors } = await db
    .from('profiles')
    .select('id,display_name')
    .in('id', [s.created_by, ...(s.approved_by ? [s.approved_by] : [])]);
  return (
    <div className="page">
      <h1 className="mb-4 text-2xl font-semibold">{t.scanReview}</h1>
      <p className="mb-3 text-sm">
        {t.scanCreatedBy}: {actors?.find((p) => p.id === s.created_by)?.display_name} ·{' '}
        <LocalTime value={s.created_at} locale={locale} />
      </p>
      <a
        href={`/scan-image/${id}`}
        target="_blank"
        rel="noreferrer"
        className="mb-5 inline-flex min-h-11 items-center underline"
      >
        {t.scanOriginal}
      </a>
      {parsed.success && (
        <details className="mb-5 rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer">{t.scanOriginalResult}</summary>
          {s.scan_type === 'RECEIPT' && (
            <p>
              {parsed.data.supplier} · {parsed.data.date} · {parsed.data.total}{' '}
              {parsed.data.currency}
            </p>
          )}
          <ul>
            {parsed.data.items.map((r, i) => (
              <li key={i}>
                {r.name}
                {' × '}
                {r.quantity ?? t.scanUncertain}
                {r.check ? ` · ${t.scanUncertain}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {s.status === 'REVIEW' && parsed.success ? (
        <ScanReviewForm
          id={id}
          type={s.scan_type}
          result={parsed.data}
          catalog={await itemCatalog()}
          locale={locale}
        />
      ) : (
        <p>
          {s.status === 'APPROVED'
            ? t.scanApproved
            : s.status === 'FAILED'
              ? t.scanFailed
              : t.scanBusy}
        </p>
      )}
      {s.approved_at && (
        <p className="mt-3">
          {t.scanApprovedBy}: {actors?.find((p) => p.id === s.approved_by)?.display_name} ·{' '}
          <LocalTime value={s.approved_at} locale={locale} />
        </p>
      )}
      {reviewed.success && s.scan_type === 'RECEIPT' && (
        <p className="mt-4">
          {t.supplier}: {reviewed.data.supplier} · {t.scanDate}: {reviewed.data.date} ·{' '}
          {t.scanTotal}: {reviewed.data.total} {reviewed.data.currency}
        </p>
      )}
      {reviewed.success && (
        <ul className="mt-4">
          {reviewed.data.rows.map((r) => (
            <li key={r.index}>
              {r.name}
              {' × '}
              {r.quantity ?? '—'} ·{' '}
              {r.action === 'IGNORE'
                ? t.scanIgnore
                : r.action === 'NEED'
                  ? t.scanNeed
                  : s.scan_type === 'NOTE'
                    ? t.scanInventory
                    : t.scanCatalog}
            </li>
          ))}
        </ul>
      )}
      <Link className="mt-6 inline-flex min-h-11 items-center underline" href="/scan">
        {t.scanHistory}
      </Link>
    </div>
  );
}
