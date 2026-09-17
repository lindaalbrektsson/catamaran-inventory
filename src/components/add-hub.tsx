import {
  CalendarClock,
  PackagePlus,
  ShoppingCart,
  ReceiptText,
  ClipboardPlus,
  FilePlus2,
} from 'lucide-react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export function AddHub({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  return (
    <div className="grid max-w-xl gap-3">
      {[
        { href: '/add?inventory=1', label: t.addStock, icon: PackagePlus },
        { href: '/tasks/new', label: t.taskAdd, icon: ClipboardPlus },
        { href: '/tasks/maintenance/plan', label: t.maintenanceShortcut, icon: CalendarClock },
        { href: '/needs/new', label: t.addPurchaseNeed, icon: ShoppingCart },
        { href: '/expenses/capture', label: t.addReceipt, icon: ReceiptText },
        { href: '/documents/new', label: t.addDocument, icon: FilePlus2 },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 font-medium"
        >
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}
