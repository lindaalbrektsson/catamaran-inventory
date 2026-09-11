import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { scanConfigured } from '@/lib/scan-ai';
import { supabase } from '@/lib/supabase/server';
import { ScanCapture } from '@/components/scan-capture';
import { LocalTime } from '@/components/local-time';
export const maxDuration = 60;
export default async function ScanPage() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale);
  if (!scanConfigured())
    return (
      <div className="page">
        <h1>{t.smartScan}</h1>
        <p>{t.scanUnavailable}</p>
      </div>
    );
  const { data, error } = await (
    await supabase()
  )
    .from('smart_scans')
    .select('id,scan_type,status,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error)
    return (
      <div className="page">
        <p>{t.scanUnavailable}</p>
      </div>
    );
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{t.smartScan}</h1>
      <ScanCapture locale={locale} owner={p.role === 'OWNER'} />
      <h2 className="mb-3 mt-8 text-xl font-semibold">{t.scanHistory}</h2>
      <div className="grid max-w-xl gap-3">
        {!data.length && <p>{t.scanEmpty}</p>}
        {data.map((s) => (
          <Link className="rounded-xl border p-4" href={`/scan/${s.id}`} key={s.id}>
            {s.scan_type === 'NOTE' ? t.scanNote : t.scanReceipt} ·{' '}
            {s.status === 'REVIEW'
              ? t.scanReviewStatus
              : s.status === 'APPROVED'
                ? t.scanApproved
                : s.status === 'FAILED'
                  ? t.scanFailed
                  : t.scanProcessingStatus}
            <br />
            <LocalTime value={s.created_at} locale={locale} />
          </Link>
        ))}
      </div>
    </div>
  );
}
