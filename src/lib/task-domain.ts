import { z } from 'zod';
import type { Task } from './database.types';
export const taskStatuses = ['NEED_REVIEW', 'IN_PROGRESS', 'DONE'] as const;
const optionalId = z.uuid().or(z.literal(''));
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
  );
export const taskSchema = z
  .object({
    requestId: z.uuid(),
    id: z.uuid(),
    version: z.coerce.number().int().min(0),
    title: z.string().trim().min(1).max(150),
    description: z.string().max(2000),
    type_code: z.string().regex(/^[A-Z_]{1,40}$/),
    status: z.enum(taskStatuses),
    assignee_id: optionalId,
    due_date: date,
    remind_at: z
      .string()
      .refine((v) => !v || (!Number.isNaN(Date.parse(v)) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(v))),
    product_id: optionalId,
    need_id: optionalId,
    receipt_id: optionalId,
    location_id: optionalId,
    related_task_id: optionalId,
    subtasks: z.array(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(150) })).max(30),
  })
  .refine((v) => v.id !== v.related_task_id);
// Business dates are Belize dates; the due date is not a midnight UTC instant.
export function belizeDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belize',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function taskIndicators(
  task: Pick<Task, 'status' | 'archived' | 'due_date' | 'remind_at'>,
  now = new Date(),
) {
  if (task.archived || task.status === 'DONE') return [];
  const today = belizeDate(now),
    tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const result: ('taskOverdue' | 'taskDueToday' | 'taskDueTomorrow' | 'taskReminderDue')[] = [];
  if (task.due_date) {
    if (task.due_date < today) result.push('taskOverdue');
    else if (task.due_date === today) result.push('taskDueToday');
    else if (task.due_date === tomorrow) result.push('taskDueTomorrow');
  }
  if (task.remind_at && Date.parse(task.remind_at) <= now.getTime()) result.push('taskReminderDue');
  return result;
}
export function reminderToInput(value: string | null) {
  return value ? new Date(Date.parse(value) - 6 * 3600000).toISOString().slice(0, 16) : '';
}
export function reminderFromInput(value: string) {
  if (!value) return '';
  const instant = new Date(value + '-06:00');
  return Number.isNaN(instant.getTime()) ? value : instant.toISOString();
}
