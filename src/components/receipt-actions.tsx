import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export function ReceiptActions({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-2">
      <Link
        href="/expenses/capture?type=FUEL"
        className="flex min-h-16 items-center justify-center rounded-xl border bg-card p-4 font-semibold"
      >
        {t.addFuelReceipt}
      </Link>
      <Link
        href="/expenses/capture?type=STORE"
        className="flex min-h-16 items-center justify-center rounded-xl border bg-card p-4 font-semibold"
      >
        {t.addStoreReceipt}
      </Link>
    </div>
  );
}
