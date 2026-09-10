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
          <article key={location.id} className="rounded-2xl border bg-card p-5">
            <Link href={`/inventory/${location.id}`} className="flex min-h-14 items-center gap-4">
              <Icon aria-hidden="true" className="size-7 text-primary" />
              <h2 className="text-xl font-semibold">{location.name}</h2>
            </Link>
            {canAdd && (
              <Link
                href={`/inventory/${location.id}?action=add`}
                className="mt-4 flex min-h-14 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                {t.add}
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
