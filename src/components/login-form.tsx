'use client';
import { useActionState } from 'react';
import { signIn } from '@/lib/actions';
import { dictionary,type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
export function LoginForm({locale}:{locale:Locale}) {
  const [state,action,pending]=useActionState(signIn,{}),t=dictionary(locale);
  return <form action={action} className="mt-8 grid gap-5"><div className="field"><Label htmlFor="email">{t.email}</Label><Input id="email" name="email" type="email" autoComplete="username" maxLength={254} required/></div><div className="field"><Label htmlFor="password">{t.password}</Label><Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/></div>{state.error&&<p id="login-error" role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t[state.error]}</p>}<Button type="submit" disabled={pending} className="mt-2 w-full" aria-describedby={state.error?'login-error':undefined}>{pending?t.signingIn:t.signIn}</Button></form>;
}
