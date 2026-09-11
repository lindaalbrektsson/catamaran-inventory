import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { itemCatalog } from '@/lib/item-catalog';
import { NeedForm } from '@/components/need-form';
import { PageHeader } from '@/components/page-header';
export default async function NewNeed() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <PageHeader title={t.needNew} locale={locale} back="/needs" />
      <NeedForm
        locale={locale}
        catalog={await itemCatalog()}
        id={crypto.randomUUID()}
        requestId={crypto.randomUUID()}
      />
    </div>
  );
}
