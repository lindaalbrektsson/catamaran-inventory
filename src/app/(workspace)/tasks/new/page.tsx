import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { taskCatalog } from '@/lib/tasks';
import { dictionary } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TaskForm } from '@/components/task-form';
export default async function NewTask() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const locale = await getLocale();
  return (
    <div className="page">
      <PageHeader title={dictionary(locale).taskAdd} back="/tasks" locale={locale} />
      <TaskForm
        catalog={await taskCatalog()}
        locale={locale}
        id={crypto.randomUUID()}
        requestId={crypto.randomUUID()}
        actorId={p.id}
      />
    </div>
  );
}
