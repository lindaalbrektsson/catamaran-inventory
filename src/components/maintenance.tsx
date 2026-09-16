'use client';
import { TaskUpdateForm } from './task-update-form';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createMaintenance, planMaintenance, updateMaintenance } from '@/lib/maintenance-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import type { MaintenanceCatalog } from '@/lib/maintenance';
import type { MaintenanceOccurrence } from '@/lib/database.types';
const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
export function MaintenanceCreate({ locale, today }: { locale: Locale; today: string }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(createMaintenance, {}),
    [repeat, setRepeat] = useState('NONE'),
    [id, setId] = useState(() => crypto.randomUUID());
  return (
    <form
      action={action}
      onChange={() => setId(crypto.randomUUID())}
      className="grid max-w-xl gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={pending} className="contents">
        <label className="grid gap-2">
          {t.taskTitle}
          <input
            name="title"
            required
            maxLength={150}
            className={control}
            spellCheck
            lang={locale}
          />
        </label>
        <label className="grid gap-2">
          {t.maintenanceRecurrence}
          <select
            name="recurrence"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className={control}
          >
            {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const).map((r) => (
              <option key={r} value={r}>
                {t[`maintenance${r}`]}
              </option>
            ))}
          </select>
        </label>
        {repeat === 'CUSTOM' ? (
          <label className="grid gap-2">
            {t.maintenanceDays}
            <input type="number" name="days" min={1} max={3650} required className={control} />
          </label>
        ) : (
          <input type="hidden" name="days" value="" />
        )}
        {repeat !== 'NONE' ? (
          <label className="grid gap-2">
            {t.maintenanceStart}
            <input type="date" name="due" defaultValue={today} required className={control} />
          </label>
        ) : (
          <input type="hidden" name="due" value="" />
        )}
        {repeat !== 'NONE' ? (
          <label className="grid gap-2">
            {t.maintenanceTime}
            <input type="time" name="time" className={control} />
          </label>
        ) : (
          <input type="hidden" name="time" value="" />
        )}
        {repeat === 'WEEKLY' ? (
          <label className="grid gap-2">
            {t.maintenanceWeekday}
            <select name="weekday" defaultValue="1" className={control}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option value={d} key={d}>
                  {new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
                    new Date(Date.UTC(2026, 0, 4 + d)),
                  )}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="weekday" value="" />
        )}
        {repeat === 'MONTHLY' ? (
          <label className="grid gap-2">
            {t.maintenanceMonthday}
            <input
              type="number"
              name="monthday"
              min={1}
              max={31}
              defaultValue={1}
              required
              className={control}
            />
          </label>
        ) : (
          <input type="hidden" name="monthday" value="" />
        )}
        {state.error && <p role="alert">{t[state.error]}</p>}
        <button className={control}>{pending ? t.saving : t.maintenanceSave}</button>
      </fieldset>
    </form>
  );
}
export function MaintenanceList({
  catalog,
  locale,
  tab = 'today',
  planner = false,
}: {
  catalog: MaintenanceCatalog;
  locale: Locale;
  tab?: string;
  planner?: boolean;
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(planMaintenance, {});
  const tasks = catalog.tasks.filter(
    (x) => !x.archived && catalog.rules.some((r) => r.task_id === x.id),
  );
  const open = catalog.occurrences.filter((x) => x.status !== 'DONE'),
    rule = (id: string) => catalog.rules.find((r) => r.task_id === id)!;
  const groups = planner ? ['due', 'pending'] : [tab];
  return (
    <div className="grid gap-4">
      <nav aria-label={t.maintenance} className="flex gap-2">
        {(['today', 'pending', 'recurring'] as const).map((x) => (
          <Link
            key={x}
            href={'/tasks/maintenance?tab=' + x}
            className="min-h-12 rounded-xl border px-3 py-3"
            aria-current={!planner && tab === x ? 'page' : undefined}
          >
            {x === 'today'
              ? t.maintenanceToday
              : x === 'pending'
                ? t.maintenancePending
                : t.maintenanceRecurring}
          </Link>
        ))}
      </nav>
      {!planner && (
        <div className="flex flex-wrap gap-3">
          <Link className={control + ' w-auto'} href="/tasks/maintenance/plan">
            {t.maintenanceBuild}
          </Link>
          <Link className={control + ' w-auto'} href="/tasks/maintenance/new">
            {t.maintenanceAdd}
          </Link>
        </div>
      )}
      <form action={action} className="grid gap-4">
        {groups.map((group) => {
          const selected = tasks.filter((task) =>
            group === 'today'
              ? open.some((o) => o.task_id === task.id && o.plan_date <= catalog.today)
              : group === 'pending'
                ? rule(task.id).recurrence === 'NONE' && task.status !== 'DONE'
                : rule(task.id).recurrence !== 'NONE' &&
                  (group !== 'due' ||
                    (rule(task.id).next_due ?? '') < catalog.today ||
                    (rule(task.id).next_due === catalog.today &&
                      (rule(task.id).due_time ?? '00:00:00') <= catalog.clock)),
          );
          return (
            <section key={group} className="grid gap-2">
              {planner && (
                <h2 className="font-semibold">
                  {group === 'due' ? t.maintenanceDue : t.maintenancePending}
                </h2>
              )}
              {!selected.length && <p>{t.maintenanceEmpty}</p>}
              {selected.map((task) => {
                const r = rule(task.id),
                  o = open.find((x) => x.task_id === task.id);
                return (
                  <article className="rounded-xl border p-3" key={task.id}>
                    {planner && (
                      <label className="flex min-h-12 items-center gap-3">
                        <input
                          type="checkbox"
                          name="task"
                          value={task.id}
                          disabled={pending || Boolean(o)}
                          className="size-6"
                        />
                        {task.title}
                      </label>
                    )}
                    <Link
                      className="inline-flex min-h-11 items-center font-semibold"
                      href={'/tasks/maintenance/' + task.id}
                    >
                      {planner ? t.maintenanceOpen : task.title}
                    </Link>
                    {o && (
                      <>
                        <p>
                          {o.manual_assignee ||
                            catalog.people.find((p) => p.id === o.assignee_id)?.display_name ||
                            t.taskUnassigned}{' '}
                          · {t[`maintenance${o.status}`]}
                        </p>
                        {o.remaining && (
                          <p className="break-words">
                            {t.maintenanceRemaining} {o.remaining}
                          </p>
                        )}
                        {planner && <p>{t.maintenancePlanned}</p>}
                      </>
                    )}
                    {r.recurrence !== 'NONE' && (
                      <p className="text-sm">
                        {t[`maintenance${r.recurrence}`]}
                        {r.custom_days ? ' · ' + r.custom_days : ''} · {t.maintenanceNext}:{' '}
                        {r.next_due}
                        {r.due_time ? ' · ' + r.due_time.slice(0, 5) : ''}
                        {r.last_completed && (
                          <>
                            {' '}
                            · {t.maintenanceLast}:{' '}
                            {new Date(r.last_completed).toLocaleDateString(locale, {
                              timeZone: 'America/Belize',
                            })}
                          </>
                        )}
                      </p>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
        {state.error && <p role="alert">{t[state.error]}</p>}
        {planner && (
          <button disabled={pending} className={control + ' bg-primary text-primary-foreground'}>
            {pending ? t.saving : t.maintenancePlanAdd}
          </button>
        )}
      </form>
    </div>
  );
}
export function MaintenanceWork({
  occurrence: o,
  people,
  locale,
}: {
  occurrence: MaintenanceOccurrence;
  people: MaintenanceCatalog['people'];
  locale: Locale;
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(updateMaintenance, {}),
    [assignee, setAssignee] = useState(o.assignee_id ?? (o.manual_assignee ? 'manual' : ''));
  const next = {
    PENDING: ['PENDING', 'IN_PROGRESS'],
    IN_PROGRESS: ['IN_PROGRESS', 'READY'],
    READY: ['READY', 'IN_PROGRESS', 'DONE'],
    DONE: ['DONE'],
  } as const;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="version" value={o.version} />
      <fieldset disabled={pending} className="contents">
        <label className="grid gap-2">
          {t.taskAssignee}
          <select
            name="assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={control}
          >
            <option value="">{t.taskUnassigned}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
            <option value="manual">{t.maintenanceManual}</option>
          </select>
        </label>
        {assignee === 'manual' ? (
          <label className="grid gap-2">
            {t.maintenancePerson}
            <input
              name="manual"
              maxLength={100}
              required
              defaultValue={o.manual_assignee}
              className={control}
            />
          </label>
        ) : (
          <input type="hidden" name="manual" value="" />
        )}
        <label className="grid gap-2">
          {t.taskStatus}
          <select name="status" defaultValue={o.status} className={control}>
            {next[o.status].map((x) => (
              <option key={x} value={x}>
                {t[`maintenance${x}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          {t.maintenanceRemaining}
          <textarea
            name="remaining"
            maxLength={1000}
            defaultValue={o.remaining}
            className={control}
          />
        </label>
        {state.error && <p role="alert">{t[state.error]}</p>}
        <button className={control}>{pending ? t.saving : t.maintenanceSave}</button>
      </fieldset>
    </form>
  );
}
export function MaintenanceUpdateForm({
  occurrence,
  locale,
}: {
  occurrence: string;
  locale: Locale;
}) {
  return <TaskUpdateForm occurrence={occurrence} locale={locale} />;
}
