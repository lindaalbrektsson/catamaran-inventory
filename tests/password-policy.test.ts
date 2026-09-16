import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { PASSWORD_MIN_LENGTH, passwordSchema } from '../src/lib/password-policy';
import { newPasswordSchema } from '../src/lib/auth-domain';
import { dictionary } from '../src/lib/i18n';

it.each(['abcdef', 'ABCDEF', '123456', '!!!!!!', '      ', 'éééééé', 'x'.repeat(129)])(
  'accepts minimum-length passwords without character restrictions',
  (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password, confirm: password }).success).toBe(true);
  },
);
it('rejects short passwords and mismatching confirmations', () => {
  expect(PASSWORD_MIN_LENGTH).toBe(6);
  expect(passwordSchema.safeParse('12345').success).toBe(false);
  expect(newPasswordSchema.safeParse({ password: '123456', confirm: '123457' }).success).toBe(
    false,
  );
});
it('both languages describe the shared minimum', () => {
  for (const locale of ['en', 'es'] as const)
    expect(dictionary(locale).passwordRules).toContain(String(PASSWORD_MIN_LENGTH));
});
