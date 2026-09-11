import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase/server';
import { dictionary } from '@/lib/i18n';
import { collect } from '@/lib/inventory';
import { DesktopOnly } from '@/components/desktop-only';
import { StaffProfileForm } from '@/components/staff-profile-form';
export default async function Staff() {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER') redirect('/inventory');
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
        <section className="mb-6 rounded-xl border bg-secondary p-5">
          <h2 className="font-semibold">{t.staffProvision}</h2>
          <p className="mt-3 leading-6">{t.staffAdminBoundary}</p>
          <p className="mt-3 leading-6">{t.staffProvisionSteps}</p>
          <p className="mt-3 text-sm leading-6">{t.staffPasswordBoundary}</p>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          {profiles.map((p) => (
            <StaffProfileForm key={p.id} profile={p} locale={locale} />
          ))}
        </div>
      </div>
    </DesktopOnly>
  );
}
