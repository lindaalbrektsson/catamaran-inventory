import type { ScanState } from '@/lib/scan-actions';
export async function approveScan(id: string, review: unknown): Promise<ScanState> {
  sessionStorage.setItem('scan-approved', JSON.stringify({ id, review }));
  return { id };
}
