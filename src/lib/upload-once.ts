// In-memory only. A retry after final validation fails need not resend bytes
// already accepted by Storage. The server must still verify/finalize every time.
const uploads = new Map<string, Promise<unknown>>();
export async function uploadOnce<T extends { error: unknown }>(
  key: string,
  send: () => Promise<T>,
): Promise<T> {
  const existing = uploads.get(key);
  if (existing) return existing as Promise<T>;
  const pending = send();
  uploads.set(key, pending);
  try {
    const result = await pending;
    if (result.error) uploads.delete(key);
    // Bound memory; eviction only permits a later safe non-overwriting upload.
    if (uploads.size > 50) uploads.delete(uploads.keys().next().value!);
    return result;
  } catch (error) {
    uploads.delete(key);
    throw error;
  }
}
