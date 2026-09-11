import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { dictionary } from '@/lib/i18n';
import { ReceiptUploader } from '@/components/receipt-uploader';
export default async function Capture({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale),
    type = (await searchParams).type;
  if (type !== 'FUEL' && type !== 'STORE')
    return (
      <div className="page">
        <h1 className="mb-5 text-2xl font-semibold">{t.addReceipt}</h1>
        <div className="grid max-w-lg gap-3">
          {(['STORE', 'FUEL'] as const).map((kind) => (
            <Link
              key={kind}
              href={`/expenses/capture?type=${kind}`}
              className="flex min-h-16 items-center rounded-xl border bg-card p-5 text-lg font-semibold"
            >
              {t[kind]}
            </Link>
          ))}
        </div>
      </div>
    );
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">
        {type === 'FUEL' ? t.addFuelReceipt : t.addStoreReceipt}
      </h1>
      <div className="max-w-lg">
        <ReceiptUploader
          locale={locale}
          intakeType={type}
          kind="EXPENSE"
          parentId={crypto.randomUUID()}
          requestId={crypto.randomUUID()}
        />
      </div>
    </div>
  );
}
