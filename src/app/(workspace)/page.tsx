import Link from 'next/link';
import { ArrowRight, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, number } from '@/lib/i18n';
import { getLocationSummaries, getInventory } from '@/lib/inventory';
import { isLowStock } from '@/lib/domain';
import { LocationCards } from '@/components/location-cards';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export default async function Home() {
  await requireProfile();
  const locale = await getLocale(),
    t = dictionary(locale),
    locations = await getLocationSummaries();
  const inventory = await Promise.all(
    locations.map(async (location) => ({ location, items: await getInventory(location.id) })),
  );
  const alerts = inventory.flatMap(({ location, items }) =>
    items
      .filter((i) => isLowStock(i.quantity, i.minimum_stock))
      .map((item) => ({ location, item })),
  );
  return (
    <div className="page">
      <section className="sea-lines mb-8 rounded-2xl bg-primary p-6 text-white md:p-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
          {t.operations}
        </p>
        <h1 className="mt-4 max-w-lg text-3xl font-medium tracking-tight md:text-4xl">
          {t.greeting}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">{t.homeIntro}</p>
        <Button className="mt-6 bg-white text-primary hover:bg-white/90" asChild>
          <Link href="/inventory">
            {t.viewInventory}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="section-title">{t.needsAttention}</h2>
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
            {number(alerts.length, locale)}
          </span>
        </div>
        {alerts.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {alerts.map(({ location, item }) => (
              <Link
                key={`${location.id}-${item.product_id}`}
                href={`/inventory/${location.id}/${item.product_id}`}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-warning/15 bg-card p-5"
              >
                <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{item.product.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {location.name} · {t.minimum}: {number(item.minimum_stock!, locale)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold">{number(item.quantity, locale)}</p>
                  <p className="text-xs text-muted-foreground">{t[item.product.unit]}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="shadow-none">
            <CardContent className="flex items-start gap-4 p-5">
              <CheckCircle2 className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-medium">{t.noAlerts}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.noAlertsHint}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
      <section>
        <h2 className="section-title mb-4">{t.locations}</h2>
        <LocationCards locations={locations} locale={locale} />
      </section>
    </div>
  );
}
