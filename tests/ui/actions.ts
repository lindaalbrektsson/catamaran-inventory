import type { ActionState } from '../../src/lib/actions';
// Deliberate test response to exercise form errors. Never included in Next.js.
export async function changeStock(): Promise<ActionState> {
  return { error: 'INSUFFICIENT_STOCK' };
}
export async function transferStock(): Promise<ActionState> {
  return { error: 'INSUFFICIENT_STOCK' };
}
