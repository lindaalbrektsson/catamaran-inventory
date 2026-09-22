import { DeleteUserButton } from '@/components/delete-user-button';
import { timed } from '@/lib/performance';
import { AccountForm } from '@/components/account-form';
import { accountAdminConfigured } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { collect } from '@/lib/inventory';
import { DesktopOnly } from '@/components/desktop-only';
import { StaffProfileForm } from '@/components/staff-profile-form';
import { Suspense } from 'react';
import { StaffActivity } from '@/components/staff-activity';
import { staffLastLogins } from '@/lib/staff-activity';
import type { Profile } from '@/lib/database.types';
import type { Locale } from '@/lib/i18n';

async function Activity({
  profile,
  locale,
  logins,
}: {
  profile: Profile;
  locale: Locale;
  logins: Promise<Map<string, string | null>>;
}) {
  const values = await logins;
  return (
    <StaffActivity
      locale={locale}
      mustChangePassword={profile.must_change_password}
      credentialPending={profile.credential_pending}
      lastLogin={values.get(profile.id)}
    />
  );
}
export default async function Staff() {
  return timed('route.staff', renderStaff);
}
async function renderStaff() {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER' || !profile.account_admin) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const profiles = await timed('staff.list', () =>
    collect((a, b) =>
      db.from('profiles').select('*').order('display_name').order('id').range(a, b),
    ),
  );
  const pending = await db.rpc('pending_username_creations', {});
  if (pending.error) throw new Error('ACCOUNT_SETUP_LOAD_FAILED');
  const resumable = (pending.data ?? []) as {
    request: string;
    username: string;
    running: boolean;
  }[];
  const logins = staffLastLogins(profiles.map((p) => p.id));
  return (
    <DesktopOnly locale={locale}>
      <div className="page max-w-4xl">
        <h1 className="mb-5 text-2xl font-semibold">{t.staffManagement}</h1>
        <AccountForm locale={locale} configured={accountAdminConfigured()} />
        {resumable.map((r) => (
          <section key={r.request}>
            <p>{t.accountSetupPending}</p>
            <AccountForm
              locale={locale}
              initialRequest={r.request}
              initialUsername={r.username}
              configured={accountAdminConfigured() && !r.running}
            />
          </section>
        ))}
        <div className="grid gap-5 lg:grid-cols-2">
          {profiles.map((p) => (
            <section key={p.id} className="grid content-start gap-4">
              <StaffProfileForm profile={p} locale={locale} />
              <Suspense
                fallback={
                  <StaffActivity
                    locale={locale}
                    mustChangePassword={p.must_change_password}
                    credentialPending={p.credential_pending}
                    loading
                  />
                }
              >
                <Activity profile={p} locale={locale} logins={logins} />
              </Suspense>
              {p.credential_pending && <p role="status">{t.accountSetupPending}</p>}
              {p.id !== profile.id && !p.account_admin && (
                <DeleteUserButton target={p.id} locale={locale} />
              )}
              {
                <AccountForm
                  profile={p}
                  self={p.id === profile.id}
                  locale={locale}
                  configured={accountAdminConfigured()}
                />
              }
            </section>
          ))}
        </div>
      </div>
    </DesktopOnly>
  );
}
