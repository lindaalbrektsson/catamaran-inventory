import { TestRecordControls } from '@/components/test-record-controls';
import { ReminderLink } from '@/components/reminder-link';
import { MergedItemNotice, type MergedItemReference } from '@/components/merged-item-reference';
import { TaskUpdateHistory } from '@/components/task-update-history';
import { TaskUpdateForm } from '@/components/task-update-form';
import { ReminderSnooze } from '@/components/reminder-snooze';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { taskCatalog } from '@/lib/tasks';
import { supabase } from '@/lib/supabase/server';
import { collect, validId } from '@/lib/inventory';
import { dictionary, type Key } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TaskForm } from '@/components/task-form';
import { TaskProgress } from '@/components/task-progress';
import { LocalTime } from '@/components/local-time';
import type { Json } from '@/lib/database.types';
export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale),
    { id } = await params;
  validId(id);
  const db = await supabase();
  const { data: task, error } = await db.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('TASK_LOAD_FAILED');
  if (!task) notFound();
  if (task.type_code === 'MAINTENANCE') {
    const r = await db.from('maintenance_rules').select('task_id').eq('task_id', id).maybeSingle();
    if (r.data) redirect('/tasks/maintenance/' + id);
  }
  const [catalog, subtasks, history, delivery, merged] = await Promise.all([
    taskCatalog(),
    collect((a, b) =>
      db
        .from('task_subtasks')
        .select('*')
        .eq('task_id', id)
        .order('created_at')
        .order('id')
        .range(a, b),
    ),
    db.rpc('task_history', { p_id: id }),
    db.rpc('reminder_delivery_status', { p_id: id }),
    task.product_id
      ? db.rpc('item_merge_relationship', { p_id: task.product_id })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (merged.error) throw new Error('ITEM_RELATIONSHIP_LOAD_FAILED');
  const relationship = merged.data as MergedItemReference | null;
  if (delivery.error) throw new Error('REMINDER_STATUS_LOAD_FAILED');
  if (history.error) throw new Error('TASK_HISTORY_LOAD_FAILED');
  const name = (id: string | null) =>
    catalog.people.find((x) => x.id === id)?.display_name ?? t.taskUnassigned;
  const canManage =
      ['OWNER', 'MANAGER'].includes(p.role) &&
      (!task.reminder_private ||
        (task.assignee_id ?? task.created_by) === p.id ||
        (p.role === 'OWNER' && task.created_by === p.id)),
    type = catalog.types.find((x) => x.code === task.type_code);
  const productLocations =
    task.product_id && canManage
      ? await collect((a, b) =>
          db
            .from('inventory_balances')
            .select('location_id')
            .eq('product_id', task.product_id!)
            .order('location_id')
            .range(a, b),
        )
      : [];
  const productLocation =
    productLocations.find((x) => x.location_id === task.location_id)?.location_id ??
    productLocations.find((x) => catalog.locations.some((l) => l.id === x.location_id))
      ?.location_id;
  const fields: Record<string, Key> = {
    title: 'taskTitle',
    description: 'taskDescription',
    type_code: 'taskType',
    status: 'taskStatus',
    assignee_id: 'taskAssignee',
    due_date: 'taskDueDate',
    remind_at: 'taskReminder',
    completed: 'taskCompletedAt',
    archived: 'taskArchived',
    product_id: 'inventory',
    need_id: 'needsTitle',
    receipt_id: 'receipts',
    location_id: 'itemLocation',
    related_task_id: 'taskRelatedTask',
  };
  const obj = (v: Json | null) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  function value(k: string, v: Json | undefined) {
    if (v === null || v === undefined || v === '') return t.notSet;
    if (k === 'assignee_id') return name(String(v));
    if (k === 'status') return t[`taskStatus${v}` as Key] ?? String(v);
    if (k === 'type_code') {
      const x = catalog.types.find((x) => x.code === v);
      return x ? (locale === 'es' ? x.name_es : x.name_en) : String(v);
    }
    if (k === 'completed') return v ? t.taskCompletedAt : t.taskIncomplete;
    if (k === 'archived') return v ? t.taskArchivedYes : t.taskArchivedNo;
    if (k === 'product_id')
      return catalog.products.find((x) => x.id === v)?.name ?? t.taskPreviousReference;
    if (k === 'need_id')
      return catalog.needs.find((x) => x.id === v)?.name ?? t.taskPreviousReference;
    if (k === 'location_id')
      return catalog.locations.find((x) => x.id === v)?.name ?? t.taskPreviousReference;
    if (k === 'related_task_id')
      return catalog.tasks.find((x) => x.id === v)?.title ?? t.taskPreviousReference;
    if (k === 'receipt_id') return t.receipt;
    return String(v);
  }
  return (
    <div className="page max-w-5xl">
      <TestRecordControls table="tasks" record={task} locale={locale} back="/tasks" />
      <PageHeader title={task.title} locale={locale} back="/tasks" />
      {canManage && !task.archived && <ReminderLink taskId={id} locale={locale} />}
      <div className="mb-5 grid gap-2">
        {relationship && <MergedItemNotice value={relationship} locale={locale} />}
        {task.remind_at && (
          <p className="text-sm">
            {t.pushTitle}:{' '}
            {Number(obj(delivery.data).sent) > 0
              ? t.reminderSent
              : Number(obj(delivery.data).claimed) > 0
                ? t.reminderDeliveryAttempted
                : t.reminderNotSent}
          </p>
        )}
        <p>
          {t[`taskStatus${task.status}`]} ·{' '}
          {type ? (locale === 'es' ? type.name_es : type.name_en) : task.type_code}
        </p>
        <p>
          {task.reminder_private ? t.reminderRecipient : t.taskAssignee}: {name(task.assignee_id)}
        </p>
        {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}
        {task.due_date && (
          <p>
            {t.taskDueDate}: {task.due_date}
          </p>
        )}
        {task.remind_at && (
          <p>
            {t.taskReminder}: <LocalTime locale={locale} value={task.remind_at} />
          </p>
        )}
        <p className="text-sm">
          {task.reminder_private ? t.reminderCreatedBy : t.taskCreated}: {name(task.created_by)} ·{' '}
          <LocalTime locale={locale} value={task.created_at} />
        </p>
        <p className="text-sm">
          {t.taskUpdated}: {name(task.updated_by)} ·{' '}
          <LocalTime locale={locale} value={task.updated_at} />
        </p>
      </div>
      {canManage && (
        <div className="mb-5 flex flex-wrap gap-3">
          {task.product_id && (!relationship || relationship.target_active) && (
            <Link
              className="min-h-12 rounded-xl border p-3"
              href={
                relationship
                  ? `/items/${relationship.target_id}`
                  : productLocation
                    ? `/inventory/${productLocation}/${task.product_id}`
                    : '/inventory'
              }
            >
              {relationship?.target_name ??
                catalog.products.find((x) => x.id === task.product_id)?.name ??
                t.inventory}
            </Link>
          )}
          {task.need_id && (
            <Link className="min-h-12 rounded-xl border p-3" href={`/needs/${task.need_id}`}>
              {catalog.needs.find((x) => x.id === task.need_id)?.name ?? t.needsTitle}
            </Link>
          )}
          {task.receipt_id && catalog.receipts.some((x) => x.id === task.receipt_id) && (
            <Link
              className="min-h-12 rounded-xl border p-3"
              href={
                p.role === 'OWNER'
                  ? `/expenses/inbox/${task.receipt_id}`
                  : `/intake-image/${task.receipt_id}`
              }
            >
              {t.receipts}
            </Link>
          )}
          {task.location_id && (
            <Link
              className="min-h-12 rounded-xl border p-3"
              href={`/inventory/${task.location_id}`}
            >
              {catalog.locations.find((x) => x.id === task.location_id)?.name ?? t.itemLocation}
            </Link>
          )}
        </div>
      )}
      {task.related_task_id && catalog.tasks.some((x) => x.id === task.related_task_id) && (
        <Link
          className="mb-5 inline-flex min-h-12 items-center underline"
          href={`/tasks/${task.related_task_id}`}
        >
          {t.taskRelatedTask}
        </Link>
      )}
      {!task.archived && (!task.reminder_private || canManage) && (
        <TaskProgress
          key={`status-${task.version}`}
          task={task}
          locale={locale}
          requestId={crypto.randomUUID()}
        />
      )}
      {!task.archived &&
        task.status !== 'DONE' &&
        task.remind_at &&
        (task.assignee_id ?? task.created_by) === p.id && (
          <ReminderSnooze
            key={`snooze-${task.version}`}
            id={id}
            actorId={p.id}
            version={task.version}
            locale={locale}
          />
        )}
      <section className="my-5 min-w-0">
        <h2 className="mb-3 text-xl font-semibold">{t.updatesTitle}</h2>
        <TaskUpdateHistory
          key={crypto.randomUUID()}
          task={id}
          locale={locale}
          people={catalog.people}
        />
        {canManage && !task.archived && task.status !== 'DONE' && (
          <details>
            <summary className="min-h-12 cursor-pointer py-3">{t.maintenanceUpdate}</summary>
            <TaskUpdateForm task={id} locale={locale} />
          </details>
        )}
      </section>
      <h2 className="my-4 text-xl font-semibold">
        {t.taskSubtasks} ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
      </h2>
      <div className="grid gap-3">
        {subtasks.map((s) => (
          <div key={s.id}>
            {task.archived || (task.reminder_private && !canManage) ? (
              <p>
                {s.completed ? '✓ ' : ''}
                {s.title}
              </p>
            ) : (
              <TaskProgress
                key={`${s.id}-${task.version}`}
                task={task}
                subtask={s}
                locale={locale}
                requestId={crypto.randomUUID()}
              />
            )}
            {s.completed_by && <p className="px-4 text-sm">{name(s.completed_by)}</p>}
          </div>
        ))}
      </div>
      {canManage && !task.archived && (
        <details className="my-5 rounded-xl border p-4">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold">{t.taskEdit}</summary>
          <TaskForm
            key={task.version}
            initial={task}
            subtasks={subtasks}
            catalog={catalog}
            locale={locale}
            id={task.id}
            requestId={crypto.randomUUID()}
            actorId={p.id}
            actorRole={p.role}
          />
        </details>
      )}
      {canManage && (p.role === 'OWNER' || task.reminder_private) && (
        <details className="my-5 rounded-xl border p-4">
          <summary className="min-h-12 cursor-pointer py-3">
            {task.archived
              ? t.taskRestore
              : task.reminder_private
                ? t.reminderDelete
                : t.taskArchive}
          </summary>
          <p className="mb-3 text-sm">{t.taskArchiveHint}</p>
          <TaskProgress
            key={`archive-${task.version}`}
            task={task}
            locale={locale}
            requestId={crypto.randomUUID()}
            archive
          />
        </details>
      )}
      <details className="my-5 rounded-xl border p-4">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">{t.taskHistory}</summary>
        <p className="mb-3 text-sm">{t.taskHistoryLimit}</p>
        {history.data.map((a) => {
          const before = obj(a.before_data),
            after = obj(a.after_data);
          return (
            <div className="border-t py-3" key={a.id}>
              <p>
                {a.action === 'INSERT' ? t.taskCreated : t.taskUpdated} · {name(a.actor_id)} ·{' '}
                <LocalTime locale={locale} value={a.created_at} />
              </p>
              {a.entity_type === 'task_subtasks' && (
                <p>
                  {t.taskSubtasks}: {String(after.title ?? '')}
                </p>
              )}
              {Object.entries(fields)
                .filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
                .map(([k, label]) => (
                  <p className="break-words text-sm" key={k}>
                    {t[label]}: {value(k, before[k])} → {value(k, after[k])}
                  </p>
                ))}
            </div>
          );
        })}
      </details>
    </div>
  );
}
