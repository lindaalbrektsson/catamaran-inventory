import Link from 'next/link';
import { Sailboat, Warehouse, ArrowUpRight } from 'lucide-react';
import type { LocationSummary } from '@/lib/inventory';
import { dictionary, dateTime, number, type Locale } from '@/lib/i18n';
import { Card, CardContent } from './ui/card';
import { EmptyState } from './empty-state';
export function LocationCards({
  locations,
  locale,
}: {
  locations: LocationSummary[];
  locale: Locale;
}) {
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
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">{t[location.type]}</p>
                    <h2 className="mt-1 text-lg font-semibold">{location.name}</h2>
                  </div>
                  <ArrowUpRight
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t.activeItems}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">
                      {number(location.activeItems, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t.lowStock}</dt>
                    <dd
                      className={`mt-1 text-2xl font-semibold tabular-nums ${location.lowStockCount ? 'text-warning' : 'text-primary'}`}
                    >
                      {number(location.lowStockCount, locale)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {location.latestMovement?.transaction_type === 'STOCK_COUNT_ADJUSTMENT'
                        ? t.lastCount
                        : t.lastMovement}
                    </dt>
                    <dd className="mt-1 text-sm">
                      {location.latestMovement ? (
                        <time dateTime={location.latestMovement.created_at}>
                          {dateTime(location.latestMovement.created_at, locale)}
                        </time>
                      ) : (
                        t.noActivity
                      )}
                    </dd>
                  </div>
                </dl>
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
