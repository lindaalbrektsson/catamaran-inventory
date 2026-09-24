import Link from 'next/link';
import { Wallet, ChevronRight } from 'lucide-react';
import { hasCashbookAccess } from '@/lib/cashbook';
import { dictionary, type Locale } from '@/lib/i18n';

// Stream this independently: a membership lookup must not delay Home/location content.
export async function CashbookNavigationLink({
  locale,
  desktop = false,
}: {
  locale: Locale;
  desktop?: boolean;
}) {
  let allowed = false;
  try {
    allowed = await hasCashbookAccess();
  } catch {
    /* Hide on failed permission read. */
  }
  if (!allowed) return null;
  const t = dictionary(locale);
  return (
    <Link
      href="/cashbook"
      prefetch={false}
      className={
        desktop
          ? 'mt-2 flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted'
          : 'flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3'
      }
    >
      <Wallet aria-hidden="true" className="size-5 text-primary" />
      <span className="flex-1">{t.cashbook}</span>
      {!desktop && <ChevronRight aria-hidden="true" className="size-4" />}
    </Link>
  );
}
