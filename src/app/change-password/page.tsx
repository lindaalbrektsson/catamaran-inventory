import { redirect } from 'next/navigation';
import { getProfile, getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { PasswordChangeForm } from '@/components/password-change-form';
import { signOut } from '@/lib/actions';
export default async function ChangePassword() {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (!profile.must_change_password) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="text-2xl font-semibold">{t.newPasswordTitle}</h1>
      <p className="mt-3">{t.newPasswordHint}</p>
      <PasswordChangeForm locale={locale} />
      <form action={signOut}>
        <button className="mt-5 min-h-12 underline">{t.signOut}</button>
      </form>
    </main>
  );
}
