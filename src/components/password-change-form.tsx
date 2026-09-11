'use client';
import { useActionState } from 'react';
import { changeFirstPassword } from '@/lib/staff-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function PasswordChangeForm({ locale }: { locale: Locale }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(changeFirstPassword, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-2">
        {t.newPasswordTitle}
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
        />
      </label>
      <label className="grid gap-2">
        {t.confirmPassword}
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
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
