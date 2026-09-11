import type { RecoveryState } from '../../src/lib/recovery-actions';
export async function recoverPassword(
  _previous: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (form.get('intent') === 'send') return { step: 'code' };
  if (form.get('intent') === 'verify')
    return form.get('code') === '123456'
      ? { step: 'password' }
      : { step: 'code', error: 'recoveryCodeError' };
  return { step: 'password', error: 'passwordChangeFailed' };
}
