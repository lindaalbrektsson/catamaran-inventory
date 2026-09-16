import { requireProfile, getLocale } from '@/lib/auth';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { GlobalItemEditor } from '@/components/global-items';
import { PageHeader } from '@/components/page-header';
export default async function NewItem() {
  await requireProfile();
  const [locale, catalog] = await Promise.all([getLocale(), itemCatalog()]);
  return (
    <div className="page max-w-xl">
      <PageHeader title={dictionary(locale).addItem} locale={locale} />
      <GlobalItemEditor catalog={catalog} locale={locale} />
    </div>
  );
}
