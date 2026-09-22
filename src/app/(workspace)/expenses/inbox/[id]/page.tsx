import { TestRecordControls } from '@/components/test-record-controls';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { validId } from '@/lib/inventory';
import { dictionary } from '@/lib/i18n';
import { LocalTime } from '@/components/local-time';
import { ReceiptReview } from '@/components/receipt-review';
export default async function IntakeDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireProfile(),
    { id } = await params;
  validId(id);
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const { data: r, error } = await db
    .from('receipt_intake')
    .select('*')
    .eq('id', id)
    .eq('upload_ready', true)
    .maybeSingle();
  if (error || !r) notFound();
  const actor = await db
    .from('profiles')
    .select('display_name')
    .eq('id', r.uploaded_by)
    .maybeSingle();
  return (
    <div className="page">
      <TestRecordControls table="receipt_intake" record={r} locale={locale} back="/expenses" />
      <h1 className="text-2xl font-semibold">{t[r.receipt_type]}</h1>
      <p className="my-3">
        {actor.data?.display_name ?? r.uploaded_by} ·{' '}
        <LocalTime value={r.created_at} locale={locale} /> · {t[r.payment_method]}
      </p>
      <Image
        unoptimized
        src={`/intake-image/${id}`}
        width={900}
        height={1200}
        alt={t.receipt}
        className="mb-6 max-h-[65vh] w-full object-contain"
      />
      {p.role === 'OWNER' && (
        <div className="mb-6 flex flex-wrap gap-3">
          <a
            className="rounded-xl border p-3"
            href={`/intake-image/${id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.openOriginal}
          </a>
          <a className="rounded-xl border p-3" href={`/intake-image/${id}?download=1`}>
            {t.downloadReceipt}
          </a>
          {!r.original_preserved && (
            <p className="w-full text-sm text-muted-foreground">{t.processedReceipt}</p>
          )}
        </div>
      )}
      {p.role === 'OWNER' && (
        <ReceiptReview
          id={id}
          status={r.status}
          details={r.review_details as Record<string, string>}
          locale={locale}
        />
      )}
    </div>
  );
}
