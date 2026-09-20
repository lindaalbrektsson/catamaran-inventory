'use client';
import { EmptyState } from './empty-state';
import { ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from './status-badge';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { compactDate, relativeDue } from '@/lib/list-presentation';
import { dictionary, type Locale } from '@/lib/i18n';
import { taskIndicators, taskStatuses } from '@/lib/task-domain';
import type { Task, TaskType } from '@/lib/database.types';
export function TaskList({
  tasks,
  people,
  types,
  locale,
  actorId,
  initialAssignee = 'me',
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
    [filters, setFilters] = useState({
      status: 'OPEN',
      assignee: initialAssignee === 'me' ? actorId : initialAssignee,
      type: '',
      due: '',
      before: '',
      archived: false,
    }),
    [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const { status, assignee, type, due, before, archived } = filters;
  const filterCount =
    Number(status !== 'OPEN') +
    Number(!!assignee && assignee !== actorId) +
    Number(!!type) +
    Number(!!due) +
    Number(!!before) +
    Number(archived);
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
      ? open
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
          <h2 className="flex items-center gap-3 text-xl font-semibold">
            <span className="domain-mark">
              <ClipboardCheck aria-hidden="true" className="size-5" />
            </span>
            {t.tasksTitle}
          </h2>
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
      {!home && canManage && (
        <Link
          href="/tasks/maintenance"
          className="mb-4 flex min-h-12 items-center gap-3 rounded-xl border p-3"
        >
          <CalendarClock aria-hidden="true" className="size-5" />
          <span className="flex-1">{t.maintenance}</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      )}
      {home ? (
        <>
          <p className="mb-3 text-sm">
            {t.taskAssignedCount.replace('{n}', String(mine.length))} ·{' '}
            {t.taskDueCount.replace('{n}', String(soon.length))}
          </p>
          <Link
            className="mb-4 inline-flex min-h-12 items-center gap-2 rounded-xl border px-3"
            href="/tasks?assignee=me"
          >
            {t.taskViewMine}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
          {canManage && (
            <Link
              className="mb-4 ml-2 inline-flex min-h-12 items-center gap-2 rounded-xl border px-3"
              href="/tasks?assignee="
            >
              {t.taskViewAll}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={assignee === actorId}
              className={`selection-control ${c} ${assignee === actorId ? 'bg-secondary font-semibold' : ''}`}
              onClick={() => setFilters({ ...filters, assignee: actorId })}
            >
              {t.taskMyTasks}
            </button>
            <button
              type="button"
              aria-pressed={assignee === ''}
              className={`selection-control ${c} ${assignee === '' ? 'bg-secondary font-semibold' : ''}`}
              onClick={() => setFilters({ ...filters, assignee: '' })}
            >
              {t.taskAllTasks}
            </button>
            <button
              type="button"
              aria-expanded={filterOpen}
              aria-controls="task-filters"
              aria-pressed={filterCount > 0 || filterOpen}
              className={`selection-control ${c} ml-auto`}
              onClick={() => {
                setDraft(filters);
                setFilterOpen(!filterOpen);
              }}
            >
              {t.taskFilter}{' '}
              {filterCount > 0 && (
                <span className="ml-2 rounded-full bg-secondary px-2 py-1 text-sm">
                  {filterCount}
                </span>
              )}
            </button>
          </div>
          {filterOpen && (
            <form
              id="task-filters"
              aria-label={t.taskFilter}
              className="mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                setFilters(draft);
                setFilterOpen(false);
              }}
            >
              <label className="grid gap-2">
                {t.taskStatus}
                <select
                  className={c}
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
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
                <select
                  className={c}
                  value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                >
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
                <select
                  className={c}
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
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
                <select
                  className={c}
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                >
                  <option value="">{t.taskAll}</option>
                  {(
                    ['taskOverdue', 'taskDueToday', 'taskDueTomorrow', 'taskReminderDue'] as const
                  ).map((k) => (
                    <option key={k} value={k}>
                      {t[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                {t.taskDueBy}
                <input
                  type="date"
                  className={c}
                  value={draft.before}
                  onChange={(e) => setDraft({ ...draft, before: e.target.value })}
                />
              </label>
              <label className="flex min-h-12 items-center gap-3 self-end">
                <input
                  type="checkbox"
                  checked={draft.archived}
                  onChange={(e) => setDraft({ ...draft, archived: e.target.checked })}
                />
                {t.taskArchived}
              </label>
              <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  className={c}
                  onClick={() =>
                    setDraft({
                      status: 'OPEN',
                      assignee: actorId,
                      type: '',
                      due: '',
                      before: '',
                      archived: false,
                    })
                  }
                >
                  {t.taskResetFilters}
                </button>
                <button type="submit" className={`${c} bg-primary text-primary-foreground`}>
                  {t.taskApplyFilters}
                </button>
              </div>
            </form>
          )}
        </>
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
                <StatusBadge
                  tone={
                    task.status === 'DONE'
                      ? 'positive'
                      : task.status === 'IN_PROGRESS'
                        ? 'active'
                        : 'attention'
                  }
                >
                  {t[`taskStatus${task.status}`]}
                </StatusBadge>{' '}
                <span className="rounded bg-muted px-2 py-1 text-xs">
                  {type ? (locale === 'es' ? type.name_es : type.name_en) : task.type_code}
                </span>
              </p>
              <p className="mt-1 text-sm">
                {t.taskAssignee}:{' '}
                {people.find((p) => p.id === task.assignee_id)?.display_name ?? t.taskUnassigned}
              </p>
              {task.due_date ? (
                <p className="mt-1 text-sm">
                  <time dateTime={task.due_date}>{compactDate(task.due_date, locale)}</time>
                  {task.status !== 'DONE' && <> · {relativeDue(task.due_date, clock, locale)}</>}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t.uxNoDue}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {taskIndicators(task, clock).map((k) => (
                  <StatusBadge key={k} tone={k === 'taskOverdue' ? 'problem' : 'attention'}>
                    {t[k]}
                  </StatusBadge>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
      {!displayed.length && <EmptyState domain="tasks" title={t.taskEmpty} />}
    </section>
  );
}
