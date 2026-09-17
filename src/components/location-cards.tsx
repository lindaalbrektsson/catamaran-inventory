import Link from 'next/link';
import { Sailboat, Warehouse } from 'lucide-react';
import type { Location } from '@/lib/database.types';
import { dictionary, type Locale } from '@/lib/i18n';
import { EmptyState } from './empty-state';
export function LocationCards({
  locations,
  locale,
  canAdd = false,
}: {
  locations: Location[];
  locale: Locale;
  canAdd?: boolean;
}) {
  const t = dictionary(locale);
  if (!locations.length) return <EmptyState title={t.noLocations} hint={t.noLocationsHint} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {locations.map((location) => {
        const Icon = location.type === 'BOAT' ? Sailboat : Warehouse;
        return (
          <article
            key={location.id}
            data-location={location.type}
            className="rounded-2xl border bg-card p-5 shadow-sm"
          >
            <Link
              href={`/inventory/${location.id}`}
              className="interactive-card flex min-h-14 items-center gap-4 rounded-xl"
            >
              <span className="location-mark">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <h2 className="text-xl font-semibold">{location.name}</h2>
            </Link>
            {canAdd && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(['add', 'remove', 'transfer'] as const).map((action) => (
                  <Link
                    key={action}
                    href={`/inventory/${location.id}?action=${action}`}
                    className="flex min-h-12 items-center justify-center rounded-xl border bg-background px-2 font-semibold"
                  >
                    {t[action]}
                  </Link>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
