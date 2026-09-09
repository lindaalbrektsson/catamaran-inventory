import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { LocationCards } from '@/components/location-cards';
export default async function Add() {
  await requireProfile();
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <PageHeader title={t.addTitle} description={t.addHint} locale={locale} />
      <LocationCards locations={await getLocations()} locale={locale} />
      <aside className="mt-8 rounded-xl border border-dashed p-5">
        <h2 className="text-sm font-medium">{t.stockGuide}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.stockGuideHint}</p>
      </aside>
    </div>
  );
}
