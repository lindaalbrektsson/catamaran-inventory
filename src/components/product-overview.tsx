import Link from 'next/link';
import { Plus, Minus, TriangleAlert } from 'lucide-react';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { isLowStock, can, type Role } from '@/lib/domain';
import type { InventoryItem } from '@/lib/inventory';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
export function ProductOverview({
  item,
  role,
  locale,
  basePath,
}: {
  item: InventoryItem;
  role: Role;
  locale: Locale;
  basePath: string;
}) {
  const t = dictionary(locale),
    low = isLowStock(item.quantity, item.minimum_stock);
  return (
    <div>
      <Card className="mb-5 shadow-none">
        <CardContent className="p-6">
          <p className="eyebrow">{t.currentStock}</p>
          <p className="my-5">
            <span className="text-5xl font-semibold tabular-nums tracking-tight break-all">
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
          </dl>
          {item.product.description && (
            <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.product.description}
            </p>
          )}
        </CardContent>
      </Card>
      {['OWNER', 'MANAGER'].includes(role) && (
        <div className="mb-4 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-12 items-center rounded-xl border p-3"
            href={`/inventory/items?product=${item.product_id}&location=${item.location_id}`}
          >
            {t.editItem}
          </Link>
          <Link
            className="inline-flex min-h-12 items-center rounded-xl border p-3"
            href={`${basePath}/settings-history`}
          >
            {t.itemChanges}
          </Link>
        </div>
      )}
      <div className="stock-actions grid gap-3 rounded-xl p-3 sm:grid-cols-2">
        {item.product.active && can(role, 'inventory.add') && (
          <Button asChild>
            <Link href={`${basePath}/change?mode=add`}>
              <Plus aria-hidden="true" />
              {t.addStock}
            </Link>
          </Button>
        )}
        {item.product.active && can(role, 'inventory.consume') && (
          <Button variant="outline" asChild>
            <Link href={`${basePath}/change?mode=remove`}>
              <Minus aria-hidden="true" />
              {item.product.active && can(role, 'inventory.remove') ? t.removeStock : t.consume}
            </Link>
          </Button>
        )}
        {item.product.active && can(role, 'inventory.transfer') && (
          <Button variant="outline" className="sm:col-span-2" asChild>
            <Link href={`${basePath}/transfer`}>{t.transfer}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
