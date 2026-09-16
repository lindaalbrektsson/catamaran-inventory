'use client';
import { useActionState } from 'react';
import { signIn } from '@/lib/actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PasswordInput } from './password-input';
import { Label } from './ui/label';
export function LoginForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(signIn, {}),
    t = dictionary(locale);
  return (
    <form action={action} className="mt-8 grid gap-5">
      <div className="field">
        <Label htmlFor="username">{t.username}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={40}
          disabled={pending}
        />
      </div>
      <div className="field">
        <Label htmlFor="password">{t.password}</Label>
        <PasswordInput
          locale={locale}
          id="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={1024}
        />
      </div>
      {state.error && (
        <p
          id="login-error"
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {t[state.error]}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="mt-2 w-full"
        aria-describedby={state.error ? 'login-error' : undefined}
      >
        {pending ? t.signingIn : t.signIn}
      </Button>
    </form>
  );
}
