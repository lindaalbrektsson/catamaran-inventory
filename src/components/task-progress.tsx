'use client';
import { useActionState, useState } from 'react';
import { taskProgress } from '@/lib/task-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { taskStatuses } from '@/lib/task-domain';
import type { Task, TaskSubtask } from '@/lib/database.types';
import { LocalTime } from './local-time';
export function TaskProgress({
  task,
  locale,
  requestId,
  subtask,
  archive = false,
}: {
  task: Task;
  locale: Locale;
  requestId: string;
  subtask?: TaskSubtask;
  archive?: boolean;
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(taskProgress, {}),
    [request, setRequest] = useState(requestId);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border p-4"
      onChange={() => setRequest(crypto.randomUUID())}
    >
      <input type="hidden" name="requestId" value={request} />
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="version" value={task.version} />
      <input
        type="hidden"
        name="action"
        value={archive ? 'ARCHIVE' : subtask ? 'SUBTASK' : 'STATUS'}
      />
      {archive ? (
        <>
          <input type="hidden" name="archived" value={String(!task.archived)} />
          <button disabled={pending} className="min-h-12 rounded-xl border p-3">
            {task.archived ? t.taskRestore : t.taskArchive}
          </button>
        </>
      ) : subtask ? (
        <>
          <input type="hidden" name="subtask_id" value={subtask.id} />
          <input type="hidden" name="completed" value={String(!subtask.completed)} />
          <button
            role="checkbox"
            aria-checked={subtask.completed}
            disabled={pending}
            className="flex min-h-12 items-center gap-3 text-left"
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-lg border"
            >
              {subtask.completed ? '✓' : ''}
            </span>
            <span className={subtask.completed ? 'line-through' : ''}>{subtask.title}</span>
          </button>
          {subtask.completed_at && (
            <p className="text-sm text-muted-foreground">
              {t.taskCompletedAt}: <LocalTime locale={locale} value={subtask.completed_at} />
            </p>
          )}
        </>
      ) : (
        <>
          <label className="grid gap-2">
            {t.taskStatus}
            <select
              name="status"
              defaultValue={task.status}
              disabled={pending}
              className="min-h-12 rounded-xl border bg-background p-3"
            >
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {t[`taskStatus${s}`]}
                </option>
              ))}
            </select>
          </label>
          <button disabled={pending} className="min-h-12 rounded-xl bg-secondary p-3 font-semibold">
            {t.taskUpdateStatus}
          </button>
        </>
      )}
      {state.error && <p role="alert">{t[state.error]}</p>}
    </form>
  );
}
