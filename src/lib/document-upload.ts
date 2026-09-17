'use client';
import { uploadOnce } from './upload-once';
import { createBrowserClient } from '@supabase/ssr';
import {
  prepareDocument,
  finishDocument,
  openSavedDocument,
  type DocumentResult,
} from './document-actions';
import { documentMimes, documentLimit } from './document-domain';
import type { Database } from './database.types';
export async function uploadDocument(
  _previous: DocumentResult,
  form: FormData,
): Promise<DocumentResult> {
  const file = form.get('file'),
    hasFile = file instanceof File && file.size > 0;
  let metadata = null;
  if (hasFile) {
    if (
      file.size > documentLimit ||
      !documentMimes.includes(file.type as (typeof documentMimes)[number])
    )
      return { error: 'docInvalidFile' };
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    ]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    metadata = {
      id: String(form.get('requestId')),
      content_type: file.type,
      byte_size: file.size,
      sha256: hash,
    };
  }
  const values = Object.fromEntries(form);
  // Only metadata crosses the Server Action boundary. Original bytes go
  // directly to authenticated Storage, including files above Vercel's limit.
  delete values.file;
  const prepared = await prepareDocument(
    {
      ...values,
      favorite: form.get('favorite') === 'on',
      archived: form.get('archived') === 'on',
      selected_users: form.getAll('selected_users'),
    },
    metadata,
  );
  if (prepared.error || !prepared.id) return prepared;
  if (hasFile && prepared.path && prepared.file_id) {
    try {
      const db = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      await uploadOnce('documents/' + prepared.path + '/' + metadata!.sha256, () =>
        db.storage.from('documents').upload(prepared.path!, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: '0',
        }),
      );
    } catch {
      // A transport failure may hide accepted bytes; reconcile before retry.
    }
    const done = await finishDocument(prepared.file_id);
    if (done.error) return done;
  }
  await openSavedDocument(prepared.id);
  return {};
}
