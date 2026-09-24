import { getLocale, requireProfile } from '@/lib/auth';
import { taskSummary } from '@/lib/tasks';
import { dictionary } from '@/lib/i18n';
import { TaskList } from '@/components/task-list';
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string; reminderSaved?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    catalog = await taskSummary(),
    query = await searchParams;
  return (
    <div className="page">
      {query.reminderSaved === '1' && (
        <p role="status" className="mb-3 text-sm">
          {dictionary(locale).reminderSaved}
        </p>
      )}
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
