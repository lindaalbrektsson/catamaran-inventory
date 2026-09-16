import { requireProfile, getLocale } from '@/lib/auth';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { GlobalItems } from '@/components/global-items';
import { PageHeader } from '@/components/page-header';
export default async function Items() {
  await requireProfile();
  const [locale, catalog] = await Promise.all([getLocale(), itemCatalog()]);
  return (
    <div className="page max-w-4xl">
      <PageHeader title={dictionary(locale).catalogTitle} locale={locale} />
      <GlobalItems catalog={catalog} locale={locale} />
    </div>
  );
}
