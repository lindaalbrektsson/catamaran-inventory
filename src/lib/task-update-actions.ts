'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin } from './supabase/admin';
import { validateDocument } from './document-validation';
import { validateVoice } from './voice-validation';
import { VOICE_TYPES, VOICE_MAX_BYTES } from './voice-domain';
import type { ActionState } from './actions';
import type { UpdateFile } from './database.types';
const base = z.object({
  content_type: z.string(),
  byte_size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const photoSchema = base
  .extend({
    content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    byte_size: z.number().int().positive().max(20971520),
  })
  .nullable();
const voiceSchema = base
  .extend({
    content_type: z.enum(VOICE_TYPES),
    byte_size: z.number().int().positive().max(VOICE_MAX_BYTES),
    duration: z.number().min(0.01).max(180),
  })
  .nullable();
function refresh() {
  revalidatePath('/tasks', 'layout');
}
export async function prepareTaskUpdate(
  values: unknown,
  photo: unknown,
  voice: unknown,
): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const v = z
      .object({
        id: z.uuid(),
        task: z.union([z.uuid(), z.literal('')]),
        occurrence: z.union([z.uuid(), z.literal('')]),
        body: z.string().trim().max(2000),
      })
      .safeParse(values),
    f = photoSchema.safeParse(photo),
    a = voiceSchema.safeParse(voice);
  if (!v.success || !f.success || !a.success) return { error: 'voiceInvalid' };
  if (!v.data.body && !f.data && !a.data) return { error: 'updateEmpty' };
  const { error } = await (
    await supabase()
  ).rpc('prepare_task_update', {
    p_id: v.data.id,
    p_task: v.data.task || null,
    p_occurrence: v.data.occurrence || null,
    p_body: v.data.body,
    p_photo: f.data,
    p_voice: a.data,
  });
  if (error) return { error: error.message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'taskFailed' };
  if (!f.data && !a.data) refresh();
  return {};
}
export async function finishTaskUpdate(id: string): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role) || !z.uuid().safeParse(id).success)
    return { error: 'FORBIDDEN' };
  const db = await supabase(),
    { data: u } = await db
      .from('task_updates')
      .select('*')
      .eq('id', id)
      .eq('created_by', p.id)
      .maybeSingle();
  if (!u) return { error: 'FORBIDDEN' };
  if (u.ready) return {};
  let duration: number | null = null;
  for (const kind of ['photo', 'voice'] as const) {
    const f = u[kind] as UpdateFile | null;
    if (!f) continue;
    const stored = await db.storage.from('task-update-files').download(`${id}/${kind}`);
    if (!stored.data || stored.error) return { error: 'docUploadIncomplete' };
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    if (
      bytes.length !== f.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== f.sha256
    )
      return { error: 'voiceInvalid' };
    try {
      if (kind === 'voice') duration = await validateVoice(bytes, f.content_type);
      else await validateDocument(bytes, f.content_type);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return {
        error:
          message === 'voiceDuration'
            ? 'voiceDuration'
            : message === 'voiceSize'
              ? 'voiceSize'
              : 'voiceInvalid',
      };
    }
  }
  const result = await authAdmin().rpc('finish_task_update', {
    p_id: id,
    p_actor: p.id,
    p_duration: duration,
  });
  if (result.error) return { error: 'docUploadIncomplete' };
  refresh();
  return {};
}
