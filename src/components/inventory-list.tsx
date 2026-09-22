'use client';
import { TestBadge } from './test-badge';
import { CategoryMark } from './category-mark';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import type { InventoryItem } from '@/lib/inventory';
import { dictionary, number, type Locale } from '@/lib/i18n';
import { stockPriority, stockStatus } from '@/lib/stock-status';
import { StockBadge } from './stock-badge';
import { isLowStock } from '@/lib/domain';
import { SearchField } from './search-field';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { EmptyState } from './empty-state';
export function InventoryList({
  items,
  locale,
  initialLow = false,
  inactive = false,
  action,
}: {
  items: InventoryItem[];
  locale: Locale;
  initialLow?: boolean;
  inactive?: boolean;
  action?: 'add' | 'remove' | 'transfer';
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [low, setLow] = useState(initialLow),
    [sort, setSort] = useState('stock');
  const t = dictionary(locale),
    categories = [...new Map(items.map((item) => [item.category.id, item.category])).values()];
  const filtered = items
    .filter(
      (item) =>
        item.product.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)) &&
        (!category || item.category.id === category) &&
        (!low || isLowStock(item.quantity, item.minimum_stock)),
    )
    .sort(
      (a, b) =>
        (sort === 'stock'
          ? stockPriority(a.quantity, a.minimum_stock) - stockPriority(b.quantity, b.minimum_stock)
          : sort === 'quantity'
            ? a.quantity - b.quantity
            : 0) || a.product.name.localeCompare(b.product.name, locale),
    );
  if (!items.length) return <EmptyState title={inactive ? t.noInactiveItems : t.emptyLocation} />;
  return (
    <>
      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[1fr_220px_auto]">
        <div className="col-span-2 md:col-span-1">
          <SearchField
            label={t.search}
            placeholder={t.searchHint}
            value={query}
            onChange={setQuery}
          />
        </div>
        <div>
          <Label className="sr-only" htmlFor="category">
            {t.category}
          </Label>
          <select
            className="selection-control"
            data-active={!!category}
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'es' ? c.name_es : c.name_en}
              </option>
            ))}
          </select>
        </div>
        <Button
          className="selection-control"
          variant={low ? 'secondary' : 'outline'}
          aria-pressed={low}
          onClick={() => setLow(!low)}
        >
          <TriangleAlert aria-hidden="true" />
          {t.lowStock}
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {number(filtered.length, locale)} {t.items} ·{' '}
          {number(filtered.filter((i) => isLowStock(i.quantity, i.minimum_stock)).length, locale)}{' '}
          {t.lowStock.toLocaleLowerCase(locale)} ·{' '}
          {number(
            filtered.filter((i) => stockStatus(i.quantity, i.minimum_stock) === 'running').length,
            locale,
          )}{' '}
          {t.uxRunningLow.toLocaleLowerCase(locale)}
        </p>
        <label className="flex items-center gap-2 text-xs">
          {t.uxSort}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-auto max-w-36 px-2"
          >
            <option value="stock">{t.uxStockStatus}</option>
            <option value="name">{t.uxAlphabetical}</option>
            <option value="quantity">{t.quantity}</option>
          </select>
        </label>
      </div>
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
        <div className="grid gap-2 lg:grid-cols-2">
          {filtered.map((item) => {
            return (
              <Link
                key={item.product_id}
                href={`/inventory/${item.location_id}/${item.product_id}${action === 'transfer' ? '/transfer' : action ? `/change?mode=${action}` : ''}`}
                className="interactive-card group rounded-xl"
              >
                <div className="flex min-h-20 items-center gap-3 rounded-xl border bg-card px-3 py-3 transition-colors group-hover:border-primary/50">
                  <CategoryMark category={item.category} />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold">{item.product.name}</h3>{' '}
                    <TestBadge value={item.product.is_test} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {locale === 'es' ? item.category.name_es : item.category.name_en}
                    </p>
                    {item.minimum_stock !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.minimum}: {number(item.minimum_stock, locale)}
                      </p>
                    )}
                  </div>
                  <div className="max-w-[45%] text-right">
                    <p
                      data-stock={stockStatus(item.quantity, item.minimum_stock)}
                      className="stock-quantity break-words font-semibold tabular-nums"
                    >
                      {number(item.quantity, locale)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t[item.product.unit]}
                      </span>
                    </p>
                    <div className="mt-1">
                      <StockBadge
                        quantity={item.quantity}
                        minimum={item.minimum_stock}
                        locale={locale}
                      />
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="row-chevron size-4 shrink-0 text-muted-foreground"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
