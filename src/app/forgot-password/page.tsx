import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { PublicFrame } from '@/components/public-frame';
import { RecoveryForm } from '@/components/recovery-form';
export default async function ForgotPassword() {
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <PublicFrame locale={locale}>
      <h1 className="page-title">{t.forgotPassword}</h1>
      {process.env.SMS_RECOVERY_ENABLED === 'true' ? (
        <RecoveryForm locale={locale} />
      ) : (
        <p className="mt-6">{t.recoveryUnavailable}</p>
      )}
      <p className="mt-6 text-sm">{t.recoveryLinda}</p>
      <a href="/login" className="mt-4 block min-h-12 py-3 underline">
        {t.signIn}
      </a>
    </PublicFrame>
  );
}
