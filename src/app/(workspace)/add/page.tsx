import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocationSummaries } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { LocationCards } from '@/components/location-cards';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/domain';
export default async function Add() {
  const profile = await requireProfile();
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <PageHeader title={t.addTitle} description={t.addHint} locale={locale} />
      {can(profile.role, 'expenses.create') && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" asChild>
            <Link href="/expenses/new">{t.newExpense}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/expenses/new?kind=purchase">{t.purchaseCapture}</Link>
          </Button>
        </div>
      )}
      <LocationCards locations={await getLocationSummaries()} locale={locale} />
      <aside className="mt-8 rounded-xl border border-dashed p-5">
        <h2 className="text-sm font-medium">{t.stockGuide}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.stockGuideHint}</p>
      </aside>
    </div>
  );
}
