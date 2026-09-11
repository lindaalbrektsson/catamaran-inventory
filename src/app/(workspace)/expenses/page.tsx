import Image from 'next/image';
import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { ReceiptActions } from '@/components/receipt-actions';
import { LocalTime } from '@/components/local-time';
import { redirect } from 'next/navigation';
export default async function Receipts({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; saved?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale),
    search = await searchParams;
  const status = ['NEW', 'REVIEWED', 'ARCHIVED'].includes(search.status ?? '')
      ? (search.status! as 'NEW' | 'REVIEWED' | 'ARCHIVED')
      : 'NEW',
    page = /^[1-9]\d{0,4}$/.test(search.page ?? '') ? Number(search.page) : 1;
  let query = (await supabase())
    .from('receipt_intake')
    .select('*')
    .eq('upload_ready', true)
    .order('created_at', { ascending: false })
    .order('id')
    .range((page - 1) * 20, page * 20);
  if (p.role === 'OWNER') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('RECEIPT_QUEUE_FAILED');
  const ids = [...new Set(data.map((r) => r.uploaded_by))];
  const actors = ids.length
    ? await (await supabase()).from('profiles').select('id,display_name').in('id', ids)
    : { data: [], error: null };
  if (actors.error) throw new Error('ACTORS_LOAD_FAILED');
  const names = new Map(actors.data?.map((a) => [a.id, a.display_name]));
  return (
    <div className="page">
      <h1 className="text-2xl font-semibold">{t.receipts}</h1>
      {search.saved === '1' && (
        <p role="status" className="my-4 rounded-xl bg-secondary p-4">
          {t.receiptCaptured}
        </p>
      )}
      <ReceiptActions locale={locale} />
      {p.role === 'OWNER' && (
        <div className="mb-6 hidden flex-wrap gap-3 md:flex">
          {(['NEW', 'REVIEWED', 'ARCHIVED'] as const).map((s) => (
            <Link className="rounded-xl border p-3" key={s} href={`/expenses?status=${s}`}>
              {s === 'NEW' ? t.needsReview : t[s]}
            </Link>
          ))}
          <Link className="rounded-xl border p-3" href="/expenses/records">
            {t.financialRecords}
          </Link>
        </div>
      )}
      {!data.length && <p>{t.emptyReceiptQueue}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {data.slice(0, 20).map((r) => (
          <Link
            className="rounded-xl border bg-card p-5"
            key={r.id}
            href={`/expenses/inbox/${r.id}`}
          >
            <Image
              unoptimized
              src={`/intake-image/${r.id}?thumb=1`}
              alt={t.receipt}
              width={120}
              height={160}
              className="mb-3 h-40 w-28 rounded-lg border object-contain"
            />
            <h2 className="font-semibold">{t[r.receipt_type]}</h2>
            <p className="my-2">
              {t[r.payment_method]} · {t[r.status]}
            </p>
            <p className="mb-2 text-sm">
              {t.uploadedBy}: {names.get(r.uploaded_by) ?? r.uploaded_by}
            </p>
            <LocalTime value={r.created_at} locale={locale} />
          </Link>
        ))}
      </div>
      <div className="mt-5 flex gap-5">
        {page > 1 && <Link href={`/expenses?status=${status}&page=${page - 1}`}>{t.previous}</Link>}
        {data.length > 20 && (
          <Link href={`/expenses?status=${status}&page=${page + 1}`}>{t.next}</Link>
        )}
      </div>
    </div>
  );
}
