'use client';
import { createBrowserClient } from '@supabase/ssr';
import { prepareMaintenanceUpdate, finishMaintenancePhoto } from './maintenance-actions';
import type { ActionState } from './actions';
import type { Database } from './database.types';
export async function addMaintenanceUpdate(_: ActionState, form: FormData): Promise<ActionState> {
  const file = form.get('photo'),
    hasFile = file instanceof File && file.size > 0;
  try {
    let photo = null;
    if (hasFile) {
      if (file.size > 20971520 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        return { error: 'docInvalidFile' };
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
      ]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      photo = { content_type: file.type, byte_size: file.size, sha256: hash };
    }
    const values = Object.fromEntries(form);
    delete values.photo;
    const r = await prepareMaintenanceUpdate(values, photo);
    if (r.error || !hasFile) return r;
    const db = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    await db.storage
      .from('maintenance-photos')
      .upload(String(values.id), file, {
        contentType: file.type,
        upsert: false,
        cacheControl: '0',
      });
    return await finishMaintenancePhoto(String(values.id));
  } catch {
    return { error: 'docUploadIncomplete' };
  }
}
