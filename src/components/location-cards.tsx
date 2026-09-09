import Link from 'next/link';
import { Sailboat, Warehouse, ArrowUpRight } from 'lucide-react';
import type { Location } from '@/lib/database.types';
import { dictionary, type Locale } from '@/lib/i18n';
import { Card, CardContent } from './ui/card';
import { EmptyState } from './empty-state';
export function LocationCards({ locations, locale }: { locations: Location[]; locale: Locale }) {
  const t = dictionary(locale);
  if (!locations.length) return <EmptyState title={t.noLocations} hint={t.noLocationsHint} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {locations.map((location) => {
        const Icon = location.type === 'BOAT' ? Sailboat : Warehouse;
        return (
          <Link href={`/inventory/${location.id}`} className="group rounded-xl" key={location.id}>
            <Card className="h-full shadow-none transition-colors group-hover:border-primary/50">
              <CardContent className="p-5">
                <div className="mb-6 flex items-start justify-between">
                  <span className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="eyebrow">{t[location.type]}</p>
                <h2 className="mt-2 text-xl font-semibold">{location.name}</h2>
                <p className="mt-4 text-sm font-medium text-primary">
                  {t.viewInventory}
                  <span aria-hidden="true"> →</span>
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
