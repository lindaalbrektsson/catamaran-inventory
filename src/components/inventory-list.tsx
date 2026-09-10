'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpRight, Package, TriangleAlert } from 'lucide-react';
import type { InventoryItem } from '@/lib/inventory';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { isLowStock } from '@/lib/domain';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { EmptyState } from './empty-state';
export function InventoryList({
  items,
  locale,
  initialLow = false,
  action,
}: {
  items: InventoryItem[];
  locale: Locale;
  initialLow?: boolean;
  action?: 'add';
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [low, setLow] = useState(initialLow);
  const t = dictionary(locale),
    categories = [...new Map(items.map((item) => [item.category.id, item.category])).values()];
  const filtered = items.filter(
    (item) =>
      item.product.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)) &&
      (!category || item.category.id === category) &&
      (!low || isLowStock(item.quantity, item.minimum_stock)),
  );
  if (!items.length) return <EmptyState title={t.emptyLocation} hint={t.emptyLocationHint} />;
  return (
    <>
      <div className="mb-6 grid grid-cols-[1fr_auto] gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_220px_auto]">
        <div className="col-span-2 md:col-span-1">
          <Label htmlFor="search" className="sr-only">
            {t.search}
          </Label>
          <div className="relative">
            <Search
              className="absolute left-3 top-4 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-10"
              id="search"
              type="search"
              placeholder={t.searchHint}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="sr-only" htmlFor="category">
            {t.category}
          </Label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'es' ? c.name_es : c.name_en}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant={low ? 'secondary' : 'outline'}
          aria-pressed={low}
          onClick={() => setLow(!low)}
        >
          <TriangleAlert aria-hidden="true" />
          {t.lowStock}
        </Button>
      </div>
      <p aria-live="polite" className="mb-4 text-xs text-muted-foreground">
        {number(filtered.length, locale)} {t.items}
      </p>
      {!filtered.length ? (
        <>
          <EmptyState title={t.noProducts} hint={t.noProductsHint} />
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setQuery('');
              setCategory('');
              setLow(false);
            }}
          >
            {t.clearFilters}
          </Button>
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => {
            const lowStock = isLowStock(item.quantity, item.minimum_stock);
            return (
              <Link
                key={item.product_id}
                href={`/inventory/${item.location_id}/${item.product_id}${action ? '/change?mode=add' : ''}`}
                className="group rounded-xl"
              >
                <Card className="h-full shadow-none transition-colors group-hover:border-primary/50">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold break-words">{item.product.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {locale === 'es' ? item.category.name_es : item.category.name_en}
                        </p>
                      </div>
                      <ArrowUpRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0 break-words">
                        <span className="text-3xl font-semibold tabular-nums tracking-tight break-all">
                          {number(item.quantity, locale)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t[item.product.unit]}
                        </span>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-medium ${lowStock || item.quantity === 0 ? 'bg-warning-soft text-warning' : 'bg-secondary text-primary'}`}
                      >
                        {item.quantity === 0 ? t.outOfStock : lowStock ? t.lowStock : t.inStock}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t.minimum}:{' '}
                      {item.minimum_stock === null ? t.notSet : number(item.minimum_stock, locale)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
