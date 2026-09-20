import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { taskCatalog } from '@/lib/tasks';
import { dictionary } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TaskForm } from '@/components/task-form';
export default async function NewTask({
  searchParams,
}: {
  searchParams: Promise<{ reminderFor?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const locale = await getLocale();
  const catalog = await taskCatalog();
  const query = await searchParams;
  const reminderFor = catalog.tasks.find((task) => task.id === query.reminderFor && !task.archived);
  return (
    <div className="page">
      <PageHeader
        title={reminderFor ? dictionary(locale).usabilityReminder : dictionary(locale).taskAdd}
        back="/tasks"
        locale={locale}
      />
      <TaskForm
        catalog={catalog}
        reminderFor={reminderFor}
        locale={locale}
        id={crypto.randomUUID()}
        requestId={crypto.randomUUID()}
        actorId={p.id}
        actorRole={p.role}
      />
    </div>
  );
}
