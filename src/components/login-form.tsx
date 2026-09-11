'use client';
import { useActionState, useState } from 'react';
import { phoneCountries } from '@/lib/auth-domain';
import { signIn } from '@/lib/actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
export function LoginForm({ locale }: { locale: Locale }) {
  const [method, setMethod] = useState<'email' | 'phone'>('phone');
  const [state, action, pending] = useActionState(signIn, {}),
    t = dictionary(locale);
  return (
    <form action={action} className="mt-8 grid gap-5">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.signIn}>
        {(['phone', 'email'] as const).map((v) => (
          <button
            key={v}
            type="button"
            disabled={pending}
            aria-pressed={method === v}
            onClick={() => setMethod(v)}
            className={`min-h-12 rounded-xl border px-4 ${method === v ? 'bg-primary text-white' : 'bg-card'}`}
          >
            {v === 'phone' ? t.loginPhone : t.loginEmail}
          </button>
        ))}
      </div>
      <input type="hidden" name="method" value={method} />
      {method === 'phone' ? (
        <>
          <label className="grid gap-2">
            {t.phoneCountry}
            <select
              name="country"
              className="min-h-12 rounded-xl border bg-background p-3"
              defaultValue="501"
              disabled={pending}
            >
              {phoneCountries.map((c) => (
                <option key={c} value={c}>
                  {t[`country${c}`]}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <Label htmlFor="phone">{t.phoneNumber}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel-national"
              required
              maxLength={20}
              disabled={pending}
              aria-describedby="phone-hint"
            />
            <p id="phone-hint" className="text-sm text-muted-foreground">
              {t.phoneHint}
            </p>
          </div>
        </>
      ) : (
        <div className="field">
          <Label htmlFor="email">{t.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={pending}
          />
        </div>
      )}
      <div className="field">
        <Label htmlFor="password">{t.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
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
