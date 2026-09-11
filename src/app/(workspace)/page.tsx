import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { LocationCards } from '@/components/location-cards';
import { can } from '@/lib/domain';
export default async function Home() {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">{t.brand}</h1>
      {profile.role === 'OWNER' && (
        <Link
          href="/inventory/overview"
          className="mb-5 hidden rounded-xl border p-4 md:inline-flex"
        >
          {t.ownerWorkspace}
        </Link>
      )}
      <LocationCards
        locations={await getLocations()}
        locale={locale}
        canAdd={can(profile.role, 'inventory.add')}
      />
    </div>
  );
}
