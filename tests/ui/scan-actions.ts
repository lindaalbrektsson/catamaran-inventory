import type { ScanState } from '@/lib/scan-actions';
export async function approveScan(id: string, review: unknown): Promise<ScanState> {
  sessionStorage.setItem('scan-approved', JSON.stringify({ id, review }));
  if (sessionStorage.getItem('scan-drop-response') === 'yes') {
    sessionStorage.removeItem('scan-drop-response');
    throw new Error('Simulated lost response after commit');
  }
  return { id };
}
