import type { CashbookActionState } from '@/lib/cashbook-actions';
import type { CashbookDue } from '@/lib/cashbook-types';
import { cashbookInput } from '@/lib/cashbook-input';

// Isolated browser fixture only. No credentials, database, or production API calls.
export async function mutateCashbook(
  _previous: CashbookActionState,
  form: FormData,
): Promise<CashbookActionState> {
  try {
    cashbookInput(form);
  } catch {
    return { error: 'cashbookInvalid' };
  }
  const payload: Record<string, string | string[]> = Object.fromEntries(
    [...form].map(([key, value]) => [key, String(value)]),
  );
  if (form.has('ids')) payload.ids = form.getAll('ids').map(String);
  const requests = JSON.parse(sessionStorage.getItem('cashbook-requests') ?? '[]');
  requests.push(payload);
  sessionStorage.setItem('cashbook-requests', JSON.stringify(requests));
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (new URLSearchParams(location.search).has('uncertain') && requests.length === 1)
    return { error: 'cashbookUncertain', uncertain: true };
  if (new URLSearchParams(location.search).has('rejected')) return { error: 'cashbookInvalid' };
  window.dispatchEvent(new CustomEvent('cashbook-fixture-mutation', { detail: payload }));
  return { success: true, id: '60000000-0000-4000-8000-000000000099' };
}

export async function cashbookPaymentDetails(): Promise<{ dues: CashbookDue[] }> {
  return {
    dues: JSON.parse(sessionStorage.getItem('cashbook-fixture-dues') ?? '[]').filter(
      (row: CashbookDue) => row.kind === 'FOOD',
    ),
  };
}
