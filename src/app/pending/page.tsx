import { redirect } from 'next/navigation';
import { getLocale, getProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { PublicFrame } from '@/components/public-frame';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/actions';
export default async function Pending() {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.must_change_password && !profile.credential_pending) redirect('/change-password');
  if (profile.active) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <PublicFrame locale={locale}>
      <h1 className="page-title">{t.accountPending}</h1>
      <p className="my-5 text-muted-foreground">{t.accountPendingHint}</p>
      <form action={signOut}>
        <Button variant="outline">{t.signOut}</Button>
      </form>
    </PublicFrame>
  );
}
