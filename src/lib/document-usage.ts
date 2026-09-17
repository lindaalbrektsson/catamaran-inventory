type Usage = Record<string, { count: number; last: number }>;
const key = (userId: string) => `catamaran:document-usage:v1:${userId}`;
const event = 'document-usage-changed';
export function documentUsageSnapshot(userId: string) {
  if (!userId) return '{}';
  try {
    return localStorage.getItem(key(userId)) ?? '{}';
  } catch {
    return '{}';
  }
}
function parse(raw: string): Usage {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([id, v]) => {
        const entry = v as Usage[string];
        return (
          /^[a-z0-9-]+$/i.test(id) &&
          entry &&
          Number.isSafeInteger(entry.count) &&
          entry.count > 0 &&
          Number.isFinite(entry.last)
        );
      }),
    ) as Usage;
  } catch {
    return {};
  }
}
export function recordDocumentOpen(userId: string, documentId: string) {
  if (!userId) return;
  try {
    const usage = parse(documentUsageSnapshot(userId));
    usage[documentId] = {
      count: Math.min((usage[documentId]?.count ?? 0) + 1, 1000000),
      last: Date.now(),
    };
    const bounded = Object.fromEntries(
      Object.entries(usage)
        .sort((a, b) => b[1].last - a[1].last)
        .slice(0, 200),
    );
    localStorage.setItem(key(userId), JSON.stringify(bounded));
    window.dispatchEvent(new Event(event));
  } catch {
    /* Convenience ranking must never block opening a document. */
  }
}
export function subscribeDocumentUsage(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener('storage', callback);
  };
}
export function frequentDocuments<
  T extends { id: string; archived: boolean; current_file_id: string | null; title: string },
>(documents: T[], raw: string): T[] {
  const usage = parse(raw);
  // Only rank the current RLS-authorized list; cached IDs never grant access.
  return documents
    .filter((d) => !d.archived && d.current_file_id && usage[d.id])
    .sort(
      (a, b) =>
        usage[b.id].count - usage[a.id].count ||
        usage[b.id].last - usage[a.id].last ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 3);
}
