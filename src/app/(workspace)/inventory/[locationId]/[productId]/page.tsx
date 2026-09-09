import Link from 'next/link';
import { Plus, Minus, CheckCircle2, TriangleAlert } from 'lucide-react';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, number } from '@/lib/i18n';
import { getLocation, getItem, getHistory } from '@/lib/inventory';
import { isLowStock, can } from '@/lib/domain';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MovementHistory } from '@/components/movement-history';
export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string; productId: string }>;
  searchParams: Promise<{ saved?: string; page?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const { locationId, productId } = await params,
    search = await searchParams;
  const page = /^[1-9]\d{0,4}$/.test(search.page ?? '') ? Number(search.page) : 1;
  const [location, item, history] = await Promise.all([
    getLocation(locationId),
    getItem(locationId, productId),
    getHistory(locationId, productId, page),
  ]);
  const basePath = `/inventory/${locationId}/${productId}`,
    low = isLowStock(item.quantity, item.minimum_stock);
  return (
    <div className="page">
      <PageHeader
        title={item.product.name}
        description={`${location.name} · ${locale === 'es' ? item.category.name_es : item.category.name_en}`}
        back={`/inventory/${locationId}`}
        locale={locale}
      />
      {search.saved === '1' && (
        <p
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm text-primary"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          {t.saved}
        </p>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Card className="mb-5 shadow-none">
            <CardContent className="p-6">
              <p className="eyebrow">{t.currentStock}</p>
              <p className="my-5">
                <span className="text-6xl font-semibold tabular-nums tracking-tight">
                  {number(item.quantity, locale)}
                </span>
                <span className="ml-3 text-sm text-muted-foreground">{t[item.product.unit]}</span>
              </p>
              {low && (
                <p className="mb-5 flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  {t.lowStock}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-5 border-t pt-5">
                <div>
                  <dt className="text-xs text-muted-foreground">{t.minimum}</dt>
                  <dd className="mt-1 font-medium">
                    {item.minimum_stock === null ? t.notSet : number(item.minimum_stock, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.target}</dt>
                  <dd className="mt-1 font-medium">
                    {item.target_stock === null ? t.notSet : number(item.target_stock, locale)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">{t.unitCost}</dt>
                  <dd className="mt-1 text-sm">
                    {item.product.estimated_unit_cost === null
                      ? t.notSet
                      : new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: item.product.cost_currency,
                          currencyDisplay: 'code',
                        }).format(item.product.estimated_unit_cost)}
                  </dd>
                </div>
              </dl>
              {item.product.description && (
                <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.product.description}
                </p>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {can(profile.role, 'inventory.add') && (
              <Button asChild>
                <Link href={`${basePath}/change?mode=add`}>
                  <Plus aria-hidden="true" />
                  {t.addStock}
                </Link>
              </Button>
            )}
            {can(profile.role, 'inventory.consume') && (
              <Button variant="outline" asChild>
                <Link href={`${basePath}/change?mode=remove`}>
                  <Minus aria-hidden="true" />
                  {can(profile.role, 'inventory.remove') ? t.removeStock : t.consume}
                </Link>
              </Button>
            )}
          </div>
        </div>
        <MovementHistory {...history} locale={locale} page={page} basePath={basePath} />
      </div>
    </div>
  );
}
