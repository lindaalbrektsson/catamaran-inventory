import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { maintenanceCatalog } from '@/lib/maintenance';
import { MaintenanceCreate } from '@/components/maintenance';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';
export default async function NewMaintenance() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const locale = await getLocale(),
    catalog = await maintenanceCatalog();
  return (
    <div className="page">
      <PageHeader
        title={dictionary(locale).maintenanceAdd}
        locale={locale}
        back="/tasks/maintenance"
      />
      <MaintenanceCreate locale={locale} today={catalog.today} />
    </div>
  );
}
