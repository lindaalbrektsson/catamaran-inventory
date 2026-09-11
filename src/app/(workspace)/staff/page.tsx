import { AccountForm } from '@/components/account-form';
import { accountAdminConfigured } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { collect } from '@/lib/inventory';
import { DesktopOnly } from '@/components/desktop-only';
import { StaffProfileForm } from '@/components/staff-profile-form';
export default async function Staff() {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER' || !profile.account_admin) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const profiles = await collect((a, b) =>
    db.from('profiles').select('*').order('display_name').order('id').range(a, b),
  );
  return (
    <DesktopOnly locale={locale}>
      <div className="page max-w-4xl">
        <h1 className="mb-5 text-2xl font-semibold">{t.staffManagement}</h1>
        <AccountForm locale={locale} configured={accountAdminConfigured()} />
        <div className="grid gap-5 lg:grid-cols-2">
          {profiles.map((p) => (
            <section key={p.id} className="grid content-start gap-4">
              <StaffProfileForm profile={p} locale={locale} />
              {p.id !== profile.id && (
                <AccountForm profile={p} locale={locale} configured={accountAdminConfigured()} />
              )}
            </section>
          ))}
        </div>
      </div>
    </DesktopOnly>
  );
}
