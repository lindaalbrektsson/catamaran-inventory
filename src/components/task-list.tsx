'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { taskIndicators, taskStatuses } from '@/lib/task-domain';
import type { Task, TaskType } from '@/lib/database.types';
export function TaskList({
  tasks,
  people,
  types,
  locale,
  actorId,
  initialAssignee = '',
  now: initialNow,
  home = false,
  canManage = false,
}: {
  tasks: Task[];
  people: { id: string; display_name: string }[];
  types: TaskType[];
  locale: Locale;
  actorId: string;
  initialAssignee?: string;
  now: string;
  home?: boolean;
  canManage?: boolean;
}) {
  const t = dictionary(locale),
    [now, setNow] = useState(initialNow),
    [status, setStatus] = useState('OPEN'),
    [assignee, setAssignee] = useState(initialAssignee === 'me' ? actorId : initialAssignee),
    [type, setType] = useState(''),
    [due, setDue] = useState(''),
    [before, setBefore] = useState(''),
    [archived, setArchived] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60000);
    return () => clearInterval(timer);
  }, []);
  const clock = new Date(now),
    open = tasks.filter((x) => !x.archived && x.status !== 'DONE'),
    soon = open.filter((x) => taskIndicators(x, clock).length > 0),
    mine = open.filter((x) => x.assignee_id === actorId);
  const filtered = (
    home
      ? open.filter((x) => x.assignee_id === actorId || taskIndicators(x, clock).length)
      : tasks.filter(
          (x) =>
            x.archived === archived &&
            (status === 'ALL' || (status === 'OPEN' ? x.status !== 'DONE' : x.status === status)) &&
            (!assignee || (assignee === 'NONE' ? !x.assignee_id : x.assignee_id === assignee)) &&
            (!type || x.type_code === type) &&
            (!due ||
              taskIndicators(x, clock).includes(
                due as ReturnType<typeof taskIndicators>[number],
              )) &&
            (!before || (!!x.due_date && x.due_date <= before)),
        )
  ).sort(
    (a, b) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      b.updated_at.localeCompare(a.updated_at),
  );
  const displayed = home ? filtered.slice(0, 4) : filtered,
    c = 'min-h-12 min-w-0 rounded-xl border bg-background p-3';
  return (
    <section
      className={home ? 'mt-4 rounded-2xl border bg-card p-5' : ''}
      aria-label={t.tasksTitle}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {home ? (
          <h2 className="text-xl font-semibold">{t.tasksTitle}</h2>
        ) : (
          <h1 className="text-2xl font-semibold">{t.tasksTitle}</h1>
        )}
        {canManage && (
          <Link
            href="/tasks/new"
            className="inline-flex min-h-12 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
          >
            {t.taskAdd}
          </Link>
        )}
      </div>
      {home ? (
        <>
          <p className="mb-3 text-sm">
            {t.taskAssignedCount.replace('{n}', String(mine.length))} ·{' '}
            {t.taskDueCount.replace('{n}', String(soon.length))}
          </p>
          <Link
            className="mb-4 inline-flex min-h-12 items-center underline"
            href="/tasks?assignee=me"
          >
            {t.taskViewMine}
          </Link>
          {canManage && (
            <Link className="ml-4 inline-flex min-h-12 items-center underline" href="/tasks">
              {t.taskViewAll}
            </Link>
          )}
        </>
      ) : (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2">
            {t.taskStatus}
            <select className={c} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="OPEN">{t.taskOpen}</option>
              <option value="ALL">{t.taskAll}</option>
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {t[`taskStatus${s}`]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t.taskAssignee}
            <select className={c} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t.taskAll}</option>
              <option value="NONE">{t.taskUnassigned}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t.taskType}
            <select className={c} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t.taskAll}</option>
              {types.map((x) => (
                <option key={x.code} value={x.code}>
                  {locale === 'es' ? x.name_es : x.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t.taskDueFilter}
            <select className={c} value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">{t.taskAll}</option>
              {(['taskOverdue', 'taskDueToday', 'taskDueTomorrow', 'taskReminderDue'] as const).map(
                (k) => (
                  <option key={k} value={k}>
                    {t[k]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="grid gap-2">
            {t.taskDueBy}
            <input
              type="date"
              className={c}
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            />
          </label>
          <label className="flex min-h-12 items-center gap-3 self-end">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            {t.taskArchived}
          </label>
        </div>
      )}
      <div className={home ? 'grid gap-3' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
        {displayed.map((task) => {
          const type = types.find((x) => x.code === task.type_code);
          return (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="block min-h-14 rounded-xl border bg-card p-4"
            >
              <h3 className="break-words font-semibold">{task.title}</h3>
              <p className="mt-2 text-sm">
                {t[`taskStatus${task.status}`]} ·{' '}
                {type ? (locale === 'es' ? type.name_es : type.name_en) : task.type_code}
              </p>
              <p className="mt-1 text-sm">
                {people.find((p) => p.id === task.assignee_id)?.display_name ?? t.taskUnassigned}
              </p>
              {task.due_date && (
                <p className="mt-1 text-sm">
                  {t.taskDueDate}: <time dateTime={task.due_date}>{task.due_date}</time>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {taskIndicators(task, clock).map((k) => (
                  <span className="rounded-lg bg-secondary px-2 py-1 text-sm font-medium" key={k}>
                    {t[k]}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
      {!displayed.length && <p className="py-4 text-muted-foreground">{t.taskEmpty}</p>}
    </section>
  );
}
