import { createBrowserClient } from '@supabase/ssr';
import { analyzeScan, prepareScan, type ScanState } from './scan-actions';
import type { Database } from './database.types';
export async function uploadScan(
  file: File,
  type: 'NOTE' | 'RECEIPT',
  id: string,
): Promise<ScanState> {
  if (
    !file.size ||
    file.size > 20971520 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    return { error: 'RECEIPT_INVALID' };
  try {
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    ]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    const reserved = await prepareScan({ id, type, hash, size: file.size, mime: file.type });
    if (reserved.error || !reserved.path) return reserved;
    const db = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    await db.storage
      .from('smart-scans')
      .upload(reserved.path, file, { contentType: file.type, upsert: false, cacheControl: '0' });
    return await analyzeScan(id);
  } catch {
    return { error: 'scanFailed' };
  }
}
