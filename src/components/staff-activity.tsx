import { dateTime, dictionary, type Locale } from '@/lib/i18n';
import { StatusBadge } from './status-badge';

export function StaffActivity({
  mustChangePassword,
  credentialPending,
  lastLogin,
  loading = false,
  locale,
}: {
  mustChangePassword: boolean;
  credentialPending: boolean;
  lastLogin?: string | null;
  loading?: boolean;
  locale: Locale;
}) {
  const t = dictionary(locale);
  const incomplete = mustChangePassword || credentialPending;
  return (
    <div className="space-y-1 text-sm" aria-live="polite">
      <StatusBadge tone={incomplete ? 'attention' : 'positive'}>
        {incomplete ? t.staffFirstLoginIncomplete : t.staffSetupComplete}
      </StatusBadge>
      <p className="text-xs text-muted-foreground">
        {loading ? (
          t.loading
        ) : lastLogin === undefined ? (
          t.staffLastLoginUnavailable
        ) : lastLogin === null ? (
          t.staffNeverSignedIn
        ) : (
          <>
            {t.staffLastLogin}: <time dateTime={lastLogin}>{dateTime(lastLogin, locale)}</time>
          </>
        )}
      </p>
    </div>
  );
}
