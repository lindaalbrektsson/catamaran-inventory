import { TestRecordControls } from '@/components/test-record-controls';
import Image from 'next/image';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, dateTime } from '@/lib/i18n';
import { can } from '@/lib/domain';
import { getSpendingDetail, readSpendingKind } from '@/lib/spending';
import { PageHeader } from '@/components/page-header';
import { ReceiptUploader } from '@/components/receipt-uploader';
export default async function ExpenseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; receipt?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const { id } = await params,
    search = await searchParams,
    kind = readSpendingKind(search.kind);
  const { record, category, location, payer, receipts } = await getSpendingDetail(id, kind);
  const fields = [
    [t.category, locale === 'es' ? category.name_es : category.name_en],
    [t.location, location],
    [t.paidBy, payer],
    [t.paymentMethod, t[record.payment_method]],
    [t.recordedDateTime, dateTime(record.occurred_at, locale)],
  ];
  return (
    <div className="page max-w-2xl">
      <TestRecordControls
        table={kind === 'PURCHASE' ? 'purchases' : 'expenses'}
        record={record}
        locale={locale}
        back="/expenses"
      />
      <PageHeader
        title={kind === 'PURCHASE' ? t.purchaseDraft : t.expenses}
        back="/expenses"
        locale={locale}
      />
      {kind === 'PURCHASE' && (
        <p className="mb-5 rounded-xl bg-secondary p-4 text-sm text-primary">
          {t.purchaseDraftHint}
        </p>
      )}
      <div className="rounded-xl border bg-card p-5">
        <p className="mb-5 text-3xl font-semibold break-all">
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: record.currency,
            currencyDisplay: 'code',
          }).format(record.amount)}
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {record.notes && (
          <p className="mt-5 whitespace-pre-wrap break-words text-sm">{record.notes}</p>
        )}
      </div>
      <section className="mt-6">
        <h2 className="section-title mb-4">{t.receipts}</h2>
        {search.receipt === '1' && (
          <p role="status" className="mb-4 rounded-xl bg-secondary p-4 text-sm text-primary">
            {t.receiptSaved}
          </p>
        )}
        {!receipts.length && <p className="mb-4 text-sm text-muted-foreground">{t.noReceipts}</p>}
        <div className="mb-5 grid gap-4">
          {receipts.map((receipt) =>
            receipt.status === 'READY' ? (
              <a
                href={`/receipts/${receipt.id}`}
                target="_blank"
                rel="noopener noreferrer"
                key={receipt.id}
                className="rounded-xl border bg-card p-3"
              >
                <Image
                  unoptimized
                  src={`/receipts/${receipt.id}`}
                  alt={t.receipt}
                  width={600}
                  height={800}
                  className="max-h-72 w-full object-contain"
                />
                <span className="mt-2 flex min-h-11 items-center justify-center text-sm text-primary">
                  {t.viewReceipt}
                </span>
              </a>
            ) : (
              <p key={receipt.id} className="rounded-xl border p-4 text-sm text-muted-foreground">
                {t.receiptPending}
              </p>
            ),
          )}
        </div>
        {can(profile.role, 'receipts.upload') && (
          <div className="rounded-xl border bg-card p-5">
            <ReceiptUploader
              locale={locale}
              kind={kind}
              parentId={id}
              requestId={crypto.randomUUID()}
            />
          </div>
        )}
      </section>
    </div>
  );
}
