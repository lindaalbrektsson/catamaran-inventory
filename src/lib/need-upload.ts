'use client';
import { createBrowserClient } from '@supabase/ssr';
import { saveNeed, openSavedNeed } from './quick-actions';
import { prepareNeedPhoto, finishNeedPhoto } from './need-photo-actions';
import { optimizedImage } from './image-processing-client';
import { uploadOnce } from './upload-once';
import type { ActionState } from './actions';
import type { Database } from './database.types';
export async function uploadNeed(
  previous: ActionState,
  form: FormData,
): Promise<ActionState & { existingNeed?: string }> {
  const selected = form.get('photo');
  let file: File | null = null;
  if (selected instanceof File && selected.size) {
    try {
      file = await optimizedImage(selected, 'need');
    } catch {
      return { error: 'needPhotoInvalid' };
    }
  }
  const values = new FormData();
  for (const [k, v] of form) if (k !== 'photo') values.append(k, v);
  const saved = await saveNeed(previous, values);
  if (saved.error || !saved.needId) return saved;
  if (file) {
    const id = String(form.get('requestId'));
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    ]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    const r = await prepareNeedPhoto({
      id,
      need: saved.needId,
      version: Number(form.get('version')) + 1,
      sha256,
      byte_size: file.size,
    });
    if (r.error || !r.path) return r;
    const db = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    try {
      await uploadOnce('need-photos/' + r.path + '/' + sha256, () =>
        db.storage
          .from('need-photos')
          .upload(r.path!, file!, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' }),
      );
    } catch {
      /* Reconcile accepted bytes before offering a same-request retry. */
    }
    const done = await finishNeedPhoto(id);
    if (done.error) return done;
  }
  await openSavedNeed(saved.needId);
  return {};
}
