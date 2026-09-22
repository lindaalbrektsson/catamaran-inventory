import { TestRecordControls } from '@/components/test-record-controls';
import { MaintenancePlanLink } from '@/components/maintenance-plan-link';
import { ReminderLink } from '@/components/reminder-link';
import { MergedItemNotice, type MergedItemReference } from '@/components/merged-item-reference';
import { AssigneeLabel } from '@/components/assignee-label';
import { StatusBadge } from '@/components/status-badge';
import { compactDate } from '@/lib/list-presentation';
import { TaskUpdateHistory } from '@/components/task-update-history';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { maintenanceCatalog } from '@/lib/maintenance';
import { supabase } from '@/lib/supabase/server';
import { collect, validId } from '@/lib/inventory';
import { MaintenanceWork, MaintenanceUpdateForm } from '@/components/maintenance';
import { PageHeader } from '@/components/page-header';
import { TaskProgress } from '@/components/task-progress';
import { LocalTime } from '@/components/local-time';
import { dictionary, type Key } from '@/lib/i18n';
import type { Json } from '@/lib/database.types';
export default async function MaintenanceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historyPage?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const { id } = await params;
  validId(id);
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const requestedPage = Number((await searchParams).historyPage ?? 0);
  const historyPage =
    Number.isSafeInteger(requestedPage) && requestedPage >= 0 && requestedPage < 100000
      ? requestedPage
      : 0;
  const [catalog, completed] = await Promise.all([
    maintenanceCatalog(id),
    db
      .from('maintenance_occurrences')
      .select('*')
      .eq('task_id', id)
      .eq('status', 'DONE')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(historyPage * 20, historyPage * 20 + 20),
  ]);
  if (completed.error) throw new Error('MAINTENANCE_HISTORY_FAILED');
  const task = catalog.tasks.find((x) => x.id === id),
    rule = catalog.rules.find((x) => x.task_id === id);
  if (!task || !rule) notFound();
  const occurrences = [...(completed.data ?? []).slice(0, 20).reverse(), ...catalog.occurrences],
    ids = occurrences.map((x) => x.id);
  const [updates, history, people, subtasks, merged] = await Promise.all([
    ids.length
      ? collect((a, b) =>
          db
            .from('maintenance_updates')
            .select('*')
            .in('occurrence_id', ids)
            .order('created_at')
            .order('id')
            .range(a, b),
        )
      : Promise.resolve([]),
    db.rpc('maintenance_history', { p_task: id }),
    db.rpc('task_people'),
    collect((a, b) =>
      db
        .from('task_subtasks')
        .select('*')
        .eq('task_id', id)
        .order('created_at')
        .order('id')
        .range(a, b),
    ),
    task.product_id
      ? db.rpc('item_merge_relationship', { p_id: task.product_id })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (history.error || people.error) throw new Error('MAINTENANCE_HISTORY_FAILED');
  const name = (uid: string | null) =>
    people.data?.find((x) => x.id === uid)?.display_name ?? t.taskUnassigned;
  const obj = (v: Json | null) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const label = (k: string, v: Json | undefined) =>
    k === 'assignee_id' || k === 'completed_by' || k === 'updated_by'
      ? name(v as string | null)
      : k === 'status' &&
          typeof v === 'string' &&
          ['PENDING', 'IN_PROGRESS', 'READY', 'DONE'].includes(v)
        ? t[`maintenance${v}` as Key]
        : String(v ?? t.notSet);
  if (merged.error) throw new Error('ITEM_RELATIONSHIP_LOAD_FAILED');
  const relationship = merged.data as MergedItemReference | null;
  return (
    <div className="page max-w-3xl">
      <TestRecordControls table="tasks" record={task} locale={locale} back="/tasks/maintenance" />
      {relationship && <MergedItemNotice value={relationship} locale={locale} />}
      <PageHeader title={task.title} locale={locale} back="/tasks/maintenance" />
      {!task.archived && <ReminderLink taskId={id} locale={locale} />}
      <p>
        {t[`maintenance${rule.recurrence}`]}
        {rule.custom_days ? ' · ' + rule.custom_days : ''}
      </p>
      {rule.next_due && (
        <p>
          {t.maintenanceNext}: {rule.next_due} {rule.due_time?.slice(0, 5)}
        </p>
      )}
      {rule.last_completed && (
        <p>
          {t.maintenanceLast}: <LocalTime value={rule.last_completed} locale={locale} />
        </p>
      )}
      <MaintenancePlanLink catalog={catalog} id={id} locale={locale} />
      {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}
      {subtasks.length > 0 && (
        <details className="my-4">
          <summary className="min-h-12 py-3">{t.taskSubtasks}</summary>
          {subtasks.map((sub) =>
            task.archived ? (
              <p key={sub.id}>{sub.title}</p>
            ) : (
              <TaskProgress
                key={`${sub.id}-${task.version}`}
                task={task}
                subtask={sub}
                locale={locale}
                requestId={crypto.randomUUID()}
              />
            ),
          )}
        </details>
      )}
      {occurrences
        .slice()
        .reverse()
        .map((o, index, rows) => (
          <section key={o.id} className="my-5 grid gap-4 rounded-xl border bg-card p-4">
            {o.status === 'DONE' && (index === 0 || rows[index - 1].status !== 'DONE') && (
              <h2 className="border-b pb-3 text-xl font-semibold">{t.uxPreviousWork}</h2>
            )}
            <h2 className="text-lg font-semibold">
              {t.maintenancePlanDate}:{' '}
              <time dateTime={o.plan_date}>{compactDate(o.plan_date, locale)}</time> ·{' '}
              <StatusBadge
                tone={
                  o.status === 'DONE' ? 'positive' : o.status === 'PENDING' ? 'attention' : 'active'
                }
              >
                {t[`maintenance${o.status}`]}
              </StatusBadge>
            </h2>
            <p>
              {t.taskAssignee}:{' '}
              <AssigneeLabel
                name={o.manual_assignee || name(o.assignee_id)}
                external={!!o.manual_assignee}
                assigned={!!(o.assignee_id || o.manual_assignee)}
                locale={locale}
              />
            </p>
            {o.remaining && (
              <p className="whitespace-pre-wrap font-medium">
                {t.maintenanceRemaining} {o.remaining}
              </p>
            )}
            {o.status !== 'DONE' ? (
              <MaintenanceWork
                key={o.version}
                occurrence={o}
                people={catalog.people}
                locale={locale}
              />
            ) : (
              <p>
                {name(o.completed_by)} · <LocalTime value={o.completed_at!} locale={locale} />
              </p>
            )}
            {updates
              .filter((u) => u.occurrence_id === o.id)
              .map((u) => (
                <article key={u.id} className="border-t py-3">
                  <p className="text-sm">
                    {name(u.created_by)} · <LocalTime value={u.created_at} locale={locale} />
                  </p>
                  <p className="whitespace-pre-wrap break-words">{u.body}</p>
                  {u.photo_ready && (
                    <Link
                      prefetch={false}
                      href={'/maintenance-photo/' + u.id}
                      className="inline-flex min-h-12 items-center underline"
                    >
                      {t.maintenancePhoto}
                    </Link>
                  )}
                </article>
              ))}
            <TaskUpdateHistory
              key={crypto.randomUUID()}
              task={id}
              occurrence={o.id}
              locale={locale}
              people={people.data ?? []}
            />
            {o.status !== 'DONE' && !task.archived && (
              <section className="grid gap-3 border-t pt-4">
                <h3 className="font-semibold">{t.maintenanceUpdate}</h3>
                <MaintenanceUpdateForm occurrence={o.id} locale={locale} />
              </section>
            )}
          </section>
        ))}
      <nav className="flex flex-wrap gap-3" aria-label={t.maintenanceHistory}>
        {historyPage > 0 && (
          <Link className="min-h-12 rounded-xl border p-3" href={`?historyPage=${historyPage - 1}`}>
            {t.updatesNewer}
          </Link>
        )}
        {(completed.data?.length ?? 0) > 20 && (
          <Link className="min-h-12 rounded-xl border p-3" href={`?historyPage=${historyPage + 1}`}>
            {t.updatesMore}
          </Link>
        )}
      </nav>
      <details className="my-5">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">
          {t.maintenanceHistory}
        </summary>
        {history.data?.map((a) => {
          const before = obj(a.before_data),
            after = obj(a.after_data);
          return (
            <article key={a.id} className="border-t py-3">
              <p>
                {name(a.actor_id)} · <LocalTime value={a.created_at} locale={locale} />
              </p>
              {Object.entries({
                title: t.taskTitle,
                description: t.taskDescription,
                status: t.taskStatus,
                assignee_id: t.taskAssignee,
                manual_assignee: t.maintenancePerson,
                remaining: t.maintenanceRemaining,
                next_due: t.maintenanceNext,
                last_completed: t.maintenanceLast,
                body: t.maintenanceUpdateText,
              })
                .filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
                .map(([k, title]) => (
                  <p key={k} className="break-words text-sm">
                    {title}: {label(k, before[k])} → {label(k, after[k])}
                  </p>
                ))}
            </article>
          );
        })}
      </details>
    </div>
  );
}
