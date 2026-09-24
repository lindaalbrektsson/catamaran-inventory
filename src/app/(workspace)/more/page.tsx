import { MobilePwaOnly } from '@/components/mobile-pwa-only';
import { Suspense } from 'react';
import { CashbookNavigationLink } from '@/components/cashbook-navigation-link';
import { InstallationSettings } from '@/components/mobile-onboarding';
import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { signOut } from '@/lib/actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ReceiptText,
  ClipboardPlus,
  FilePlus2,
  Package,
  Bell,
  Users,
  ChevronRight,
} from 'lucide-react';
export default async function More() {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page max-w-3xl">
      <PageHeader title={t.account} locale={locale} />
      <Card className="shadow-none">
        <CardContent className="divide-y p-5">
          <div className="pb-5">
            <h2 className="text-xl font-semibold">{profile.display_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.account_admin && profile.role === 'OWNER'
                ? t.adminRole
                : profile.role === 'OWNER' || profile.role === 'MANAGER'
                  ? t[profile.role]
                  : t.roleReview}
            </p>
          </div>
          <form action={signOut} className="pt-5">
            <Button variant="outline">{t.signOut}</Button>
          </form>
        </CardContent>
      </Card>
      <h2 className="mb-3 mt-6 font-semibold">{t.uxNavigation}</h2>
      <nav className="grid gap-2" aria-label={t.uxNavigation}>
        {[
          { href: '/items', label: t.catalogTitle, icon: Package },
          { href: '/expenses', label: t.receipts, icon: ReceiptText },
          { href: '/tasks', label: t.tasksTitle, icon: ClipboardPlus },
          { href: '/documents', label: t.documents, icon: FilePlus2 },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3"
          >
            <Icon aria-hidden="true" className="size-5 text-primary" />
            <span className="flex-1">{label}</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ))}
        <Suspense fallback={null}>
          <CashbookNavigationLink locale={locale} />
        </Suspense>

        {profile.account_admin && (
          <Link
            href="/staff"
            className="mt-5 hidden min-h-14 items-center rounded-xl border p-4 md:flex"
          >
            <Users aria-hidden="true" className="mr-3 size-5" />
            {t.staffManagement}
          </Link>
        )}
      </nav>
      <MobilePwaOnly includeBrowser>
        <section className="mt-6" aria-label={t.uxSettings}>
          <h2 className="mb-3 font-semibold">{t.uxSettings}</h2>
          <InstallationSettings locale={locale} />
          <Link
            href="/notifications"
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3"
          >
            <Bell aria-hidden="true" className="size-5 text-primary" />
            <span className="flex-1">{t.pushTitle}</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </MobilePwaOnly>
    </div>
  );
}
