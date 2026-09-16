'use client';
import { useActionState } from 'react';
import { changeFirstPassword } from '@/lib/staff-actions';
import { PasswordInput } from './password-input';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
export function PasswordChangeForm({ locale }: { locale: Locale }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(changeFirstPassword, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-2">
        {t.newPasswordTitle}
        <PasswordInput
          locale={locale}
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          disabled={pending}
        />
      </label>
      <label className="grid gap-2">
        {t.confirmPassword}
        <PasswordInput
          locale={locale}
          name="confirm"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          disabled={pending}
        />
      </label>
      <p className="text-sm">{t.passwordRules}</p>
      {state.error && <p role="alert">{t[state.error]}</p>}
      <Button disabled={pending}>{t.savePassword}</Button>
    </form>
  );
}
