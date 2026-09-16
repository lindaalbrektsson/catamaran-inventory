import { getLocale, requireProfile } from '@/lib/auth';
import { taskSummary } from '@/lib/tasks';
import { TaskList } from '@/components/task-list';
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    catalog = await taskSummary(),
    query = await searchParams;
  return (
    <div className="page">
      <TaskList
        {...catalog}
        locale={locale}
        actorId={profile.id}
        initialAssignee={query.assignee ?? 'me'}
        now={new Date().toISOString()}
        canManage={['OWNER', 'MANAGER'].includes(profile.role)}
      />
    </div>
  );
}
