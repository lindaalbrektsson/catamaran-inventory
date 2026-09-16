import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { maintenanceCatalog } from '@/lib/maintenance';
import { MaintenanceList } from '@/components/maintenance';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';
export default async function Maintenance({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const locale = await getLocale();
  return (
    <div className="page max-w-3xl">
      <PageHeader title={dictionary(locale).maintenance} locale={locale} back="/tasks" />
      <MaintenanceList
        catalog={await maintenanceCatalog()}
        locale={locale}
        tab={(await searchParams).tab}
      />
    </div>
  );
}
