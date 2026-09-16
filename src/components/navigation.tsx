'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardCheck,
  FileText,
  House,
  Package,
  Plus,
  ReceiptText,
  Ellipsis,
  ShoppingBag,
} from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
export function Navigation({ locale }: { locale: Locale }) {
  const t = dictionary(locale),
    path = usePathname();
  const links = [
    { href: '/', label: t.home, icon: House },
    { href: '/items', label: t.catalogTitle, icon: Package, desktop: true },
    { href: '/inventory', label: t.inventory, icon: Package, desktop: true },
    { href: '/add', label: t.add, icon: Plus },
    { href: '/needs', label: t.needNav, icon: ShoppingBag, desktop: true },
    { href: '/expenses', label: t.receipts, icon: ReceiptText, desktop: true },
    { href: '/tasks', label: t.tasksTitle, icon: ClipboardCheck, desktop: true },
    { href: '/documents', label: t.documents, icon: FileText, desktop: true },
    { href: '/more', label: t.more, icon: Ellipsis },
  ];
  return (
    <nav
      aria-label={t.workspace}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-card px-2 pt-2 md:static md:flex md:flex-col md:gap-2 md:border-0 md:bg-transparent md:p-0"
    >
      {links.map(({ href, label, icon: Icon, desktop }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`${desktop ? 'hidden md:flex' : 'flex'} min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium md:min-h-12 md:flex-row md:justify-start md:gap-3 md:px-4 md:text-sm ${active ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <span
              className={
                href === '/add'
                  ? 'grid size-8 place-items-center rounded-xl bg-primary text-white md:size-6'
                  : ''
              }
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
