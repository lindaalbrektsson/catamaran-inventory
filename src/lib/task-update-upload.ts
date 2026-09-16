'use client';
import { uploadOnce } from './upload-once';
import { createBrowserClient } from '@supabase/ssr';
import { prepareTaskUpdate, finishTaskUpdate } from './task-update-actions';
import { audioMime, VOICE_MAX_BYTES, VOICE_TYPES } from './voice-domain';
import type { Database, UpdateFile } from './database.types';
import type { ActionState } from './actions';
export async function addTaskUpdate(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const files: { kind: 'photo' | 'voice'; file: File; meta: UpdateFile }[] = [];
    for (const kind of ['photo', 'voice'] as const) {
      const file = form.get(kind);
      if (!(file instanceof File) || !file.size) continue;
      const mime = kind === 'voice' ? audioMime(file.type) : file.type;
      if (kind === 'voice' && file.size > VOICE_MAX_BYTES) return { error: 'voiceSize' };
      if (
        kind === 'voice'
          ? !VOICE_TYPES.includes(mime as (typeof VOICE_TYPES)[number])
          : file.size > 20971520 || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)
      )
        return { error: 'voiceInvalid' };
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
      ]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      files.push({
        kind,
        file,
        meta: {
          content_type: mime,
          byte_size: file.size,
          sha256,
          ...(kind === 'voice' ? { duration: Number(form.get('duration')) } : {}),
        },
      });
    }
    const values = {
      id: String(form.get('id')),
      task: String(form.get('task') ?? ''),
      occurrence: String(form.get('occurrence') ?? ''),
      body: String(form.get('body') ?? ''),
    };
    const result = await prepareTaskUpdate(
      values,
      files.find((f) => f.kind === 'photo')?.meta ?? null,
      files.find((f) => f.kind === 'voice')?.meta ?? null,
    );
    if (result.error || !files.length) return result;
    const db = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    await Promise.all(
      files.map((f) =>
        uploadOnce(`task-update-files/${values.id}/${f.kind}/${f.meta.sha256}`, () =>
          db.storage.from('task-update-files').upload(`${values.id}/${f.kind}`, f.file, {
            contentType: f.meta.content_type,
            upsert: false,
            cacheControl: '0',
          }),
        ),
      ),
    );
    return await finishTaskUpdate(values.id);
  } catch {
    return { error: 'docUploadIncomplete' };
  }
}
