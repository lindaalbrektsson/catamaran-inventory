'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { documentSchema, documentFileSchema } from './document-domain';
import { validateDocument } from './document-validation';
import type { Key } from './i18n';
export type DocumentResult = {
  error?: Key;
  id?: string;
  path?: string | null;
  file_id?: string | null;
};
const failure = (message: string): DocumentResult => ({
  error: message.includes('FORBIDDEN')
    ? 'FORBIDDEN'
    : message.includes('DOCUMENT_STALE')
      ? 'docStale'
      : 'docFailed',
});
export async function prepareDocument(values: unknown, file: unknown): Promise<DocumentResult> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const v = documentSchema.safeParse(values),
    f = file === null ? null : documentFileSchema.safeParse(file);
  if (!v.success || (f && !f.success)) return { error: 'INVALID_INPUT' };
  if (
    p.role === 'MANAGER' &&
    (v.data.version !== 0 ||
      !f?.success ||
      v.data.access_level !== 'MANAGERS' ||
      v.data.favorite ||
      v.data.archived ||
      v.data.selected_users.length)
  )
    return { error: 'FORBIDDEN' };
  const { id, requestId, version, ...metadata } = v.data;
  const { data, error } = await (
    await supabase()
  ).rpc('save_document', {
    p_request: requestId,
    p_id: id,
    p_version: version,
    p_values: metadata,
    p_file: f?.success ? f.data : null,
  });
  if (error) return failure(error.message);
  revalidatePath('/');
  revalidatePath('/documents', 'layout');
  return data as DocumentResult;
}
export async function finishDocument(fileId: string): Promise<DocumentResult> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  if (!z.uuid().safeParse(fileId).success) return { error: 'INVALID_INPUT' };
  const db = await supabase(),
    { data: f } = await db
      .from('document_files')
      .select('*')
      .eq('id', fileId)
      .eq('uploaded_by', p.id)
      .maybeSingle();
  if (!f) return { error: 'FORBIDDEN' };
  const stored = await db.storage.from('documents').download(f.object_path);
  if (stored.error || !stored.data) return { error: 'docUploadIncomplete' };
  try {
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    if (
      bytes.length !== f.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== f.sha256
    )
      return { error: 'docInvalidFile' };
    await validateDocument(bytes, f.content_type);
  } catch {
    return { error: 'docInvalidFile' };
  }
  const { error } = await db.rpc('complete_document_file', { p_file: fileId });
  if (error) return failure(error.message);
  revalidatePath('/');
  revalidatePath('/documents', 'layout');
  return { id: f.document_id };
}
export async function openSavedDocument(id: string) {
  await requireProfile();
  if (!z.uuid().safeParse(id).success) return;
  redirect(`/documents/${id}`);
}
