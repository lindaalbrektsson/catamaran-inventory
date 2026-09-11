'use client';
import { useActionState, useState } from 'react';
import { saveTask } from '@/lib/task-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { reminderToInput, reminderFromInput } from '@/lib/task-domain';
import type { Task, TaskSubtask } from '@/lib/database.types';
import type { TaskCatalog } from '@/lib/tasks';
import { usePreservedForm } from './use-preserved-form';
export function TaskForm({
  locale,
  catalog,
  id,
  requestId,
  actorId,
  initial,
  subtasks = [],
}: {
  locale: Locale;
  catalog: TaskCatalog;
  id: string;
  requestId: string;
  actorId: string;
  initial?: Task;
  subtasks?: TaskSubtask[];
}) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(saveTask, {}),
    [request, setRequest] = useState(requestId),
    [rows, setRows] = useState(subtasks.map((s) => ({ id: s.id, title: s.title }))),
    [reminder, setReminder] = useState(reminderToInput(initial?.remind_at ?? null)),
    ref = usePreservedForm();
  const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
  function relation(
    name: 'product_id' | 'need_id' | 'receipt_id' | 'location_id' | 'related_task_id',
    label: string,
    options: { id: string; name: string }[],
  ) {
    const current = initial?.[name] ?? '';
    return (
      <label className="grid gap-2" key={name}>
        {label}
        <select name={name} defaultValue={current} className={control}>
          <option value="">{t.notSet}</option>
          {current && !options.some((o) => o.id === current) && (
            <option value={current}>{t.taskPreviousReference}</option>
          )}
          {options
            .filter((o) => name !== 'related_task_id' || o.id !== id)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      </label>
    );
  }
  return (
    <form
      ref={ref}
      action={action}
      className="grid max-w-2xl gap-4"
      onChange={() => setRequest(crypto.randomUUID())}
    >
      <input type="hidden" name="requestId" value={request} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={initial?.version ?? 0} />
      <input type="hidden" name="status" value={initial?.status ?? 'NEED_REVIEW'} />
      <input type="hidden" name="subtasks" value={JSON.stringify(rows)} />
      <input type="hidden" name="remind_at" value={reminderFromInput(reminder)} />
      <fieldset disabled={pending} className="contents">
        <label className="grid gap-2">
          {t.taskTitle}
          <input
            name="title"
            className={control}
            required
            maxLength={150}
            defaultValue={initial?.title}
            spellCheck
            lang={locale}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            {t.taskType}
            <select
              name="type_code"
              defaultValue={initial?.type_code ?? 'TASK'}
              className={control}
            >
              {catalog.types
                .filter((x) => x.active || x.code === initial?.type_code)
                .map((x) => (
                  <option key={x.code} value={x.code}>
                    {locale === 'es' ? x.name_es : x.name_en}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t.taskAssignee}
            <select
              name="assignee_id"
              defaultValue={initial ? (initial.assignee_id ?? '') : actorId}
              className={control}
            >
              <option value="">{t.taskUnassigned}</option>
              {catalog.people
                .filter((p) => p.active || p.id === initial?.assignee_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                    {!p.active ? ` (${t.taskInactive})` : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="grid gap-2">
          {t.taskDueDate}
          <input
            type="date"
            name="due_date"
            className={control}
            defaultValue={initial?.due_date ?? ''}
          />
        </label>
        <details className="rounded-xl border p-4" open={undefined}>
          <summary className="min-h-12 cursor-pointer py-3">{t.taskDetailsReminder}</summary>
          <div className="grid gap-4">
            <label className="grid gap-2">
              {t.taskDescription}
              <textarea
                name="description"
                maxLength={2000}
                className={control}
                defaultValue={initial?.description ?? ''}
                spellCheck
                lang={locale}
              />
            </label>
            <label className="grid gap-2">
              {t.taskReminderBelize}
              <input
                type="datetime-local"
                className={control}
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              />
            </label>
          </div>
        </details>
        <details className="rounded-xl border p-4" open={rows.length > 0 ? true : undefined}>
          <summary className="min-h-12 cursor-pointer py-3">
            {t.taskSubtasks} ({rows.length})
          </summary>
          <div className="grid gap-3">
            {rows.map((r, i) => (
              <div key={r.id} className="grid gap-2">
                <label className="grid gap-2">
                  {t.taskSubtaskTitle} {i + 1}
                  <input
                    required
                    maxLength={150}
                    className={control}
                    value={r.title}
                    spellCheck
                    lang={locale}
                    onChange={(e) =>
                      setRows(
                        rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                {!subtasks.some((s) => s.id === r.id) && (
                  <button
                    type="button"
                    className="min-h-12 justify-self-end px-3 underline"
                    aria-label={`${t.cancel}: ${t.taskSubtaskTitle} ${i + 1}`}
                    onClick={() => {
                      setRows(rows.filter((x) => x.id !== r.id));
                      setRequest(crypto.randomUUID());
                    }}
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className={control}
              disabled={rows.length >= 30}
              onClick={() => {
                setRows([...rows, { id: crypto.randomUUID(), title: '' }]);
                setRequest(crypto.randomUUID());
              }}
            >
              {t.taskAddSubtask}
            </button>
          </div>
        </details>
        <details className="rounded-xl border p-4">
          <summary className="min-h-12 cursor-pointer py-3">{t.taskRelationships}</summary>
          <div className="grid gap-4">
            {relation('product_id', t.inventory, catalog.products)}
            {relation('need_id', t.needsTitle, catalog.needs)}
            {relation(
              'receipt_id',
              t.receipts,
              catalog.receipts.map((r) => ({
                id: r.id,
                name: `${r.receipt_type === 'FUEL' ? t.FUEL : t.STORE} · ${r.created_at.slice(0, 10)} · ${r.id.slice(0, 8)}`,
              })),
            )}
            {relation('location_id', t.itemLocation, catalog.locations)}
            {relation(
              'related_task_id',
              t.taskRelatedTask,
              catalog.tasks.map((x) => ({ id: x.id, name: x.title })),
            )}
          </div>
        </details>
        {state.error && <p role="alert">{t[state.error]}</p>}
        <button
          className="min-h-14 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
          disabled={pending}
        >
          {pending ? t.saving : t.taskSave}
        </button>
      </fieldset>
    </form>
  );
}
