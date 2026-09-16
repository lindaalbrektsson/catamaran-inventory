import Link from 'next/link';
import { dictionary } from '@/lib/i18n';
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
      {['OWNER', 'MANAGER'].includes(profile.role) && (
        <Link
          className="mb-4 inline-flex min-h-12 items-center rounded-xl border p-3"
          href="/tasks/maintenance"
        >
          {dictionary(locale).maintenance}
        </Link>
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
