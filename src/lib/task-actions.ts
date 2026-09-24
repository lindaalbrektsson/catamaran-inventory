'use server';
import { creationRpc } from './test-data';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { taskSchema } from './task-domain';
import type { ActionState } from './actions';
import type { Json } from './database.types';
function taskError(message: string): ActionState {
  return {
    error: message.includes('FORBIDDEN')
      ? 'FORBIDDEN'
      : message.includes('TASK_STALE')
        ? 'taskStale'
        : message.includes('TASK_ARCHIVED')
          ? 'taskArchivedError'
          : 'taskFailed',
  };
}
function refreshTask(id: string) {
  revalidatePath('/');
  revalidatePath('/tasks', 'layout');
  revalidatePath(`/tasks/${id}`);
}
export async function saveTask(_state: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(actor.role)) return { error: 'FORBIDDEN' };
  let subtasks: unknown;
  try {
    subtasks = JSON.parse(String(form.get('subtasks') ?? '[]'));
  } catch {
    return { error: 'INVALID_INPUT' };
  }
  const parsed = taskSchema.safeParse({ ...Object.fromEntries(form), subtasks });
  if (!parsed.success) return { error: 'INVALID_INPUT' };
  const { requestId, id, version, ...values } = parsed.data;
  const { error } = await creationRpc(
    await supabase(),
    version === 0 && form.get('is_test') === 'on',
    'manage_task',
    {
      p_request: requestId,
      p_id: id,
      p_version: version,
      p_action: 'SAVE',
      p_values: values,
    },
  );
  if (error) return taskError(error.message);
  refreshTask(id);
  // A newly assigned private reminder is not readable by a Manager who is only its creator.
  if (
    version === 0 &&
    values.remind_at &&
    actor.role === 'MANAGER' &&
    values.assignee_id !== actor.id
  )
    redirect('/tasks?reminderSaved=1');
  redirect(`/tasks/${id}`);
}
export async function taskProgress(_state: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireProfile();
  const parsed = z
    .object({
      requestId: z.uuid(),
      id: z.uuid(),
      version: z.coerce.number().int().min(1),
      action: z.enum(['STATUS', 'SUBTASK', 'ARCHIVE']),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'INVALID_INPUT' };
  const v = parsed.data;
  if (v.action === 'ARCHIVE' && !['OWNER', 'MANAGER'].includes(actor.role))
    return { error: 'FORBIDDEN' };
  let values: Json;
  if (v.action === 'STATUS') values = { status: String(form.get('status')) };
  else if (v.action === 'SUBTASK')
    values = {
      subtask_id: String(form.get('subtask_id')),
      completed: form.get('completed') === 'true',
    };
  else values = { archived: form.get('archived') === 'true' };
  const { error } = await (
    await supabase()
  ).rpc('manage_task', {
    p_request: v.requestId,
    p_id: v.id,
    p_version: v.version,
    p_action: v.action,
    p_values: values,
  });
  if (error) return taskError(error.message);
  refreshTask(v.id);
  return {};
}

export async function snoozeReminder(_state: ActionState, form: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = z
    .object({
      id: z.uuid(),
      version: z.coerce.number().int().positive(),
      minutes: z.coerce.number().refine((n) => [30, 60, 120, 240, 1440].includes(n)),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'INVALID_INPUT' };
  const v = parsed.data;
  const { error } = await (
    await supabase()
  ).rpc('snooze_reminder', {
    p_id: v.id,
    p_version: v.version,
    p_minutes: v.minutes,
    p_time: v.time,
  });
  if (error) return taskError(error.message);
  refreshTask(v.id);
  return {};
}
