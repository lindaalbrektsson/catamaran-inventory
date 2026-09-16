'use client';
import { useEffect, useState, useTransition } from 'react';
import { accountChange, type AccountResult } from '@/lib/account-actions';
import { PasswordInput } from './password-input';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { dictionary, type Locale } from '@/lib/i18n';
import { phoneCountries } from '@/lib/auth-domain';
import { staffRoles } from '@/lib/domain';
import type { Profile } from '@/lib/database.types';
export function AccountForm({
  locale,
  profile,
  configured,
  self = false,
  initialRequest = '',
  initialUsername = '',
}: {
  locale: Locale;
  profile?: Profile;
  configured: boolean;
  self?: boolean;
  initialRequest?: string;
  initialUsername?: string;
}) {
  const t = dictionary(locale),
    [kind, setKind] = useState<'CREATE' | 'RESET' | 'CONTACT' | 'USERNAME'>(
      profile ? (self ? 'USERNAME' : 'RESET') : 'CREATE',
    ),
    [request, setRequest] = useState(initialRequest),
    [chosenPassword, setChosenPassword] = useState(''),
    [result, setResult] = useState<AccountResult>({}),
    [pending, start] = useTransition();
  useEffect(() => {
    const clear = () => {
      setResult({});
      setChosenPassword('');
    };
    window.addEventListener('pagehide', clear);
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  const c = 'min-h-12 rounded-xl border bg-background p-3';
  if (result.success)
    return (
      <section className="rounded-xl border bg-secondary p-5">
        <p>{t.accountCompleted}</p>
        {result.temporary && (
          <>
            <p className="mt-3">{t.temporaryOnce}</p>
            <PasswordInput
              locale={locale}
              aria-label={t.temporaryPasswordLabel}
              readOnly
              value={result.temporary}
              autoComplete="off"
              className="my-4 font-mono"
            />
          </>
        )}
        <button
          className={c}
          onClick={() => {
            setResult({});
            setRequest('');
          }}
        >
          {t.temporaryDismiss}
        </button>
      </section>
    );
  return (
    <form
      className="grid gap-4 rounded-xl border p-5"
      action={(form) => {
        const id = request || crypto.randomUUID();
        setRequest(id);
        form.set('request', id);
        setChosenPassword('');
        start(async () => {
          const response = await accountChange(form);
          setResult(document.hidden ? { ...response, temporary: undefined } : response);
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        <input type="hidden" name="request" value={request} />
        <input type="hidden" name="target" value={profile?.id ?? ''} />
        <input type="hidden" name="kind" value={kind} />
        <h2 className="font-semibold">{profile ? t.staffContact : t.staffProvision}</h2>
        {profile && (
          <label className="grid gap-2">
            {t.accountAction}
            <select
              className={c}
              disabled={pending}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as 'RESET' | 'CONTACT' | 'USERNAME');
                setRequest('');
                setResult({});
                setChosenPassword('');
              }}
            >
              {!self && <option value="RESET">{t.resetStaffPassword}</option>}
              <option value="USERNAME">{t.changeUsername}</option>
              <option value="CONTACT">{t.changeContact}</option>
            </select>
          </label>
        )}
        {!profile ? (
          <>
            <label className="grid gap-2">
              {t.staffName}
              <input required name="name" maxLength={100} className={c} />
            </label>
            <label className="grid gap-2">
              {t.staffRole}
              <select name="role" defaultValue="MANAGER" className={c}>
                {staffRoles.map((r) => (
                  <option key={r} value={r}>
                    {t[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              {t.language}
              <select name="language" className={c}>
                <option value="en">{t.en}</option>
                <option value="es">{t.es}</option>
              </select>
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="active" defaultChecked />
              {t.itemActive}
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="name" value={profile.display_name} />
            <input type="hidden" name="role" value={profile.role} />
            <input type="hidden" name="language" value={profile.language} />
          </>
        )}
        {(kind === 'CREATE' || kind === 'USERNAME') && (
          <label className="grid gap-2">
            {t.username}
            <input
              name="username"
              required
              maxLength={40}
              autoCapitalize="none"
              autoComplete="off"
              defaultValue={profile?.username ?? initialUsername}
              readOnly={Boolean(initialRequest)}
              className={c}
            />
          </label>
        )}
        {(kind === 'CREATE' || kind === 'CONTACT') && (
          <>
            <label className="grid gap-2">
              {t.phoneCountry}
              <select className={c} name="country" defaultValue="501">
                {phoneCountries.map((c) => (
                  <option key={c} value={c}>
                    {t[`country${c}`]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              {t.optionalContactPhone}
              <input type="tel" name="phone" maxLength={20} className={c} />
            </label>
          </>
        )}
        {(kind === 'CREATE' || kind === 'RESET') && (
          <>
            <label className="grid gap-2">
              {t.temporaryPasswordLabel}
              <PasswordInput
                locale={locale}
                name="temporaryPassword"
                autoComplete={kind === 'CREATE' ? 'off' : 'new-password'}
                required
                minLength={PASSWORD_MIN_LENGTH}
                className={c}
                value={chosenPassword}
                onChange={(e) => setChosenPassword(e.target.value)}
              />
            </label>
            <p className="text-sm">{t.passwordRules}</p>
          </>
        )}
        {!configured && <p role="status">{t.accountAdminSetup}</p>}
        {result.error && (
          <p role="alert">
            {t[result.error]}
            {result.error === 'accountChangeFailed' && <> {t.accountRetry}</>}
          </p>
        )}
        <button
          disabled={!configured || pending}
          className="min-h-12 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
        >
          {pending
            ? t.saving
            : kind === 'CREATE'
              ? t.staffProvision
              : kind === 'RESET'
                ? t.resetStaffPassword
                : kind === 'USERNAME'
                  ? t.changeUsername
                  : t.changeContact}
        </button>
      </fieldset>
    </form>
  );
}
