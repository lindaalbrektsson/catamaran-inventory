import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { maintenanceCatalog } from '@/lib/maintenance';
import { MaintenanceList } from '@/components/maintenance';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';
export default async function PlanMaintenance() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const locale = await getLocale();
  return (
    <div className="page max-w-3xl">
      <PageHeader
        title={dictionary(locale).maintenanceBuild}
        locale={locale}
        back="/tasks/maintenance"
      />
      <MaintenanceList locale={locale} catalog={await maintenanceCatalog()} planner />
    </div>
  );
}
