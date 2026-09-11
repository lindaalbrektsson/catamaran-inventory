'use client';
import { useActionState, useState } from 'react';
import { recoverPassword } from '@/lib/recovery-actions';
import { phoneCountries } from '@/lib/auth-domain';
import { dictionary, type Locale } from '@/lib/i18n';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function RecoveryForm({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const [state, action, pending] = useActionState(recoverPassword, {});
  const [phone, setPhone] = useState(''),
    [country, setCountry] = useState('501');
  const step = state.step ?? 'send';
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="intent" value={step === 'code' ? 'verify' : step} />
      {step === 'send' ? (
        <>
          <label className="grid gap-2">
            {t.phoneCountry}
            <select
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={pending}
              className="min-h-12 rounded-xl border bg-background p-3"
            >
              {phoneCountries.map((c) => (
                <option key={c} value={c}>
                  {t[`country${c}`]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t.phoneNumber}
            <Input
              name="phone"
              type="tel"
              autoComplete="tel-national"
              required
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={pending}
            />
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="country" value={country} />
        </>
      )}
      {step === 'code' && (
        <>
          <p>{t.recoverySent}</p>
          <label className="grid gap-2">
            {t.recoveryCode}
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              minLength={6}
              maxLength={10}
              disabled={pending}
            />
          </label>
        </>
      )}
      {step === 'password' && (
        <>
          <label className="grid gap-2">
            {t.newPasswordTitle}
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              disabled={pending}
            />
          </label>
          <label className="grid gap-2">
            {t.confirmPassword}
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              disabled={pending}
            />
          </label>
          <p>{t.passwordRules}</p>
        </>
      )}
      {state.error && <p role="alert">{t[state.error]}</p>}
      <Button type="submit" disabled={pending} className="min-h-12">
        {step === 'send' ? t.recoverySend : step === 'code' ? t.recoveryVerify : t.savePassword}
      </Button>
      {step === 'code' && (
        <a href="/forgot-password" className="min-h-12 py-3 underline">
          {t.recoveryRestart}
        </a>
      )}
    </form>
  );
}
