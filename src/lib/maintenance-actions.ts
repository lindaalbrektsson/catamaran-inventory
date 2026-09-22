'use server';
import { creationRpc } from './test-data';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin } from './supabase/admin';
import { validateDocument } from './document-validation';
import type { ActionState } from './actions';
const fail = (message: string): ActionState => ({
  error: message.includes('FORBIDDEN')
    ? 'FORBIDDEN'
    : message.includes('TASK_STALE')
      ? 'taskStale'
      : 'taskFailed',
});
async function allowed() {
  const p = await requireProfile();
  return ['OWNER', 'MANAGER'].includes(p.role) ? p : null;
}
function refresh() {
  revalidatePath('/tasks', 'layout');
  revalidatePath('/');
}
export async function createMaintenance(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await allowed())) return fail('FORBIDDEN');
  const v = z
    .object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(150),
      recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']),
      days: z.string(),
      due: z.string(),
      time: z.string(),
      weekday: z.string(),
      monthday: z.string(),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return fail('INVALID_INPUT');
  const x = v.data;
  const { error } = await creationRpc(
    await supabase(),
    form.get('is_test') === 'on',
    'create_maintenance',
    {
      p_id: x.id,
      p_title: x.title,
      p_recurrence: x.recurrence,
      p_days: x.recurrence === 'CUSTOM' ? Number(x.days) : null,
      p_due: x.recurrence === 'NONE' ? null : x.due,
      p_time: x.time || null,
      p_weekday: x.recurrence === 'WEEKLY' ? Number(x.weekday) : null,
      p_monthday: x.recurrence === 'MONTHLY' ? Number(x.monthday) : null,
    },
  );
  if (error) return fail(error.message);
  refresh();
  redirect('/tasks/maintenance/' + x.id);
}
export async function planMaintenance(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await allowed())) return fail('FORBIDDEN');
  const v = z.array(z.uuid()).min(1).max(100).safeParse(form.getAll('task'));
  if (!v.success) return fail('INVALID_INPUT');
  const { error } = await (await supabase()).rpc('plan_maintenance', { p_tasks: v.data });
  if (error) return fail(error.message);
  refresh();
  redirect('/tasks/maintenance');
}
export async function updateMaintenance(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await allowed())) return fail('FORBIDDEN');
  const v = z
    .object({
      id: z.uuid(),
      version: z.coerce.number().int().positive(),
      status: z.enum(['PENDING', 'IN_PROGRESS', 'READY', 'DONE']),
      assignee: z.union([z.uuid(), z.literal(''), z.literal('manual')]),
      manual: z.string().max(100),
      remaining: z.string().max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return fail('INVALID_INPUT');
  const x = v.data;
  const { error } = await (
    await supabase()
  ).rpc('update_maintenance', {
    p_id: x.id,
    p_version: x.version,
    p_status: x.status,
    p_assignee: x.assignee && x.assignee !== 'manual' ? x.assignee : null,
    p_manual: x.assignee === 'manual' ? x.manual : '',
    p_remaining: x.remaining,
  });
  if (error) return fail(error.message);
  refresh();
  return {};
}
export async function prepareMaintenanceUpdate(
  values: unknown,
  photo: unknown,
): Promise<ActionState> {
  if (!(await allowed())) return fail('FORBIDDEN');
  const v = z
    .object({ id: z.uuid(), occurrence: z.uuid(), body: z.string().trim().min(1).max(2000) })
    .safeParse(values);
  const f = z
    .object({
      content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      byte_size: z.number().int().min(1).max(20971520),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable()
    .safeParse(photo);
  if (!v.success || !f.success) return fail('INVALID_INPUT');
  const x = v.data;
  const { error } = await (
    await supabase()
  ).rpc('add_maintenance_update', {
    p_id: x.id,
    p_occurrence: x.occurrence,
    p_body: x.body,
    p_photo: f.data,
  });
  if (error) return fail(error.message);
  if (!f.data) refresh();
  return {};
}
export async function finishMaintenancePhoto(id: string): Promise<ActionState> {
  const p = await allowed();
  if (!p) return fail('FORBIDDEN');
  if (!z.uuid().safeParse(id).success) return fail('INVALID_INPUT');
  const db = await supabase(),
    { data: u } = await db
      .from('maintenance_updates')
      .select('*')
      .eq('id', id)
      .eq('created_by', p.id)
      .maybeSingle();
  if (!u?.photo_path || !u.content_type) return fail('FORBIDDEN');
  if (u.photo_ready) return {};
  const stored = await db.storage.from('maintenance-photos').download(u.photo_path);
  if (!stored.data || stored.error) return { error: 'docUploadIncomplete' };
  try {
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    if (
      bytes.length !== u.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== u.sha256
    )
      return { error: 'docInvalidFile' };
    await validateDocument(bytes, u.content_type);
  } catch {
    return { error: 'docInvalidFile' };
  }
  const complete = await authAdmin().rpc('finish_maintenance_photo', { p_id: id, p_actor: p.id });
  if (complete.error) return { error: 'docUploadIncomplete' };
  refresh();
  return {};
}
