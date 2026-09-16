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
export default async function MaintenanceDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/tasks');
  const { id } = await params;
  validId(id);
  const locale = await getLocale(),
    t = dictionary(locale),
    catalog = await maintenanceCatalog(),
    task = catalog.tasks.find((x) => x.id === id),
    rule = catalog.rules.find((x) => x.task_id === id);
  if (!task || !rule) notFound();
  const db = await supabase(),
    occurrences = catalog.occurrences.filter((x) => x.task_id === id),
    ids = occurrences.map((x) => x.id);
  const [updates, history, people, subtasks] = await Promise.all([
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
  return (
    <div className="page max-w-3xl">
      <PageHeader title={task.title} locale={locale} back="/tasks/maintenance" />
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
      {!occurrences.some((o) => o.status !== 'DONE') && task.status !== 'DONE' && (
        <Link
          className="my-4 inline-flex min-h-12 items-center rounded-xl border p-3"
          href="/tasks/maintenance/plan"
        >
          {t.maintenanceBuild}
        </Link>
      )}
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
        .map((o) => (
          <section key={o.id} className="my-5 grid gap-4 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">
              {t.maintenancePlanDate}: {o.plan_date} · {t[`maintenance${o.status}`]}
            </h2>
            <p>
              {t.taskAssignee}: {o.manual_assignee || name(o.assignee_id)}
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
                      href={'/maintenance-photo/' + u.id}
                      className="inline-flex min-h-12 items-center underline"
                    >
                      {t.maintenancePhoto}
                    </Link>
                  )}
                </article>
              ))}
            <TaskUpdateHistory
              task={id}
              occurrence={o.id}
              locale={locale}
              people={people.data ?? []}
            />
            {o.status !== 'DONE' && !task.archived && (
              <details>
                <summary className="min-h-12 cursor-pointer py-3">{t.maintenanceUpdate}</summary>
                <MaintenanceUpdateForm occurrence={o.id} locale={locale} />
              </details>
            )}
          </section>
        ))}
      <details className="my-5">
        <summary className="min-h-12 cursor-pointer py-3">{t.maintenanceHistory}</summary>
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
