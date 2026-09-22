'use client';
import { TestDataField } from './test-data';
import { TestBadge } from './test-badge';
import { mergePreview } from '@/lib/merge-preview';
import { CategoryMark } from './category-mark';
import { EmptyState } from './empty-state';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ItemCatalog } from '@/lib/item-domain';
import type { Product } from '@/lib/database.types';
import { dictionary, type Locale } from '@/lib/i18n';
import { normalizedName } from '@/lib/quick-domain';
import { units } from '@/lib/domain';
import { manageGlobalItem } from '@/lib/global-items-actions';
import { SearchField } from './search-field';
import { ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
export function GlobalItems({ catalog, locale }: { catalog: ItemCatalog; locale: Locale }) {
  const t = dictionary(locale),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('name');
  const items = catalog.products
    .filter(
      (p) =>
        p.active &&
        (!category || p.category_id === category) &&
        normalizedName(p.name).includes(normalizedName(query)),
    )
    .sort(
      (a, b) =>
        (sort === 'category'
          ? (
              catalog.categories.find((c) => c.id === a.category_id)?.[`name_${locale}`] ?? ''
            ).localeCompare(
              catalog.categories.find((c) => c.id === b.category_id)?.[`name_${locale}`] ?? '',
              locale,
            )
          : sort === 'newest'
            ? b.created_at.localeCompare(a.created_at)
            : 0) || a.name.localeCompare(b.name, locale),
    );
  return (
    <div className="grid gap-4">
      <Button asChild className="min-h-12">
        <Link href="/items/new">{t.addItem}</Link>
      </Button>
      <SearchField label={t.catalogSearch} value={query} onChange={setQuery} />
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-2 text-sm">
          {t.category}
          <select
            className="selection-control"
            data-active={!!category}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t.allCategories}</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c[`name_${locale}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          {t.uxSort}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t.uxAlphabetical}</option>
            <option value="category">{t.category}</option>
            <option value="newest">{t.uxNewest}</option>
          </select>
        </label>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/items/${p.id}`}
              className="interactive-card flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3"
            >
              <CategoryMark category={catalog.categories.find((c) => c.id === p.category_id)} />
              <div className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{p.name}</span>{' '}
                <TestBadge value={p.is_test} />
                <span className="text-sm text-muted-foreground">
                  {catalog.categories.find((c) => c.id === p.category_id)?.[`name_${locale}`]} ·{' '}
                  {t[p.unit]}
                </span>
              </div>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {!items.length && <EmptyState title={t.catalogEmpty} />}
    </div>
  );
}

export function GlobalItemEditor({
  catalog,
  locale,
  item,
}: {
  catalog: ItemCatalog;
  locale: Locale;
  item?: Product;
}) {
  const t = dictionary(locale),
    router = useRouter();
  const [name, setName] = useState(item?.name ?? ''),
    [category, setCategory] = useState(item?.category_id ?? ''),
    [unit, setUnit] = useState(item?.unit ?? 'piece'),
    [confirm, setConfirm] = useState(false),
    [dialog, setDialog] = useState<'DELETE' | 'MERGE' | null>(null),
    [target, setTarget] = useState(''),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const changed = (resetDuplicate = false) => {
    setRequest(crypto.randomUUID());
    setError('');
    if (resetDuplicate) setConfirm(false);
  };
  const similar = catalog.products.filter(
    (p) =>
      p.active &&
      p.id !== item?.id &&
      normalizedName(name) &&
      (normalizedName(p.name).includes(normalizedName(name)) ||
        normalizedName(name).includes(normalizedName(p.name))),
  );
  const targets = catalog.products.filter(
    (p) => p.active && p.id !== item?.id && normalizedName(p.name).includes(normalizedName(query)),
  );
  const selected = targets.find((p) => p.id === target);
  const [isTest, setIsTest] = useState(false);
  function save(action: 'CREATE' | 'EDIT' | 'DELETE' | 'MERGE') {
    start(async () => {
      setError('');
      try {
        const result = await manageGlobalItem({
          request,
          action,
          id: item?.id ?? null,
          expected: item?.updated_at ?? null,
          values:
            action === 'MERGE'
              ? { target, targetUpdatedAt: selected?.updated_at ?? null }
              : { name, category, unit, confirmDuplicate: confirm, is_test: isTest },
        });
        if (result.error) setError(result.error);
        else {
          router.push('/items');
          router.refresh();
        }
      } catch {
        setError('ITEM_INVALID');
      }
    });
  }
  const errors: Record<string, string> = {
    ITEM_SIMILAR: t.quickSimilar,
    ITEM_UNIT_CONFLICT: t.catalogUnitConflict,
    ITEM_NEED_CONFLICT: t.catalogNeedConflict,
    ITEM_STALE: t.catalogStale,
    ITEM_NOT_FOUND: t.catalogGone,
    ITEM_INVALID: t.catalogFailed,
    TEST_MERGE_CONFLICT: t.TEST_MERGE_CONFLICT,
  };
  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(item ? 'EDIT' : 'CREATE');
        }}
      >
        <label className="grid gap-2">
          {t.itemName}
          <input
            autoFocus={!item}
            spellCheck
            lang={locale}
            maxLength={150}
            required
            className={control}
            value={name}
            disabled={pending}
            onChange={(e) => {
              changed(true);
              setName(e.target.value);
            }}
          />
        </label>
        {similar.length > 0 && (
          <div className="grid gap-2 rounded-xl border p-3">
            <p>{t.quickSimilar}</p>
            {similar.slice(0, 8).map((p) =>
              item ? (
                <button
                  type="button"
                  key={p.id}
                  className={`${control} text-left`}
                  onClick={() => {
                    changed();
                    setDialog('MERGE');
                    setTarget(p.id);
                    setQuery('');
                  }}
                >
                  {t.catalogUse} · {p.name}
                </button>
              ) : (
                <Link key={p.id} href={`/items/${p.id}`} className={`${control} block`}>
                  {t.catalogUse} · {p.name}
                </Link>
              ),
            )}
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => {
                  setRequest(crypto.randomUUID());
                  setConfirm(e.target.checked);
                }}
              />
              {item ? t.catalogKeepSeparate : t.catalogCreateNew}
            </label>
          </div>
        )}
        <label className="grid gap-2">
          {t.category}
          <select
            className={control}
            required
            value={category}
            disabled={pending}
            onChange={(e) => {
              changed();
              setCategory(e.target.value);
            }}
          >
            <option value="">{t.category}</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c[`name_${locale}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          {t.itemUnit}
          <select
            className={control}
            value={unit}
            disabled={pending}
            onChange={(e) => {
              changed();
              setUnit(e.target.value as Product['unit']);
            }}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {t[u]}
              </option>
            ))}
          </select>
        </label>
        {!item && (
          <TestDataField
            locale={locale}
            onChange={(v) => {
              changed();
              setIsTest(v);
            }}
          />
        )}
        <Button className="min-h-12" disabled={pending || (similar.length > 0 && !confirm)}>
          {t.save}
        </Button>
      </form>
      {item && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="min-h-12"
            disabled={pending}
            onClick={() => {
              changed();
              setDialog('MERGE');
            }}
          >
            {t.catalogMerge}
          </Button>
          {!item.is_test && (
            <Button
              variant="ghost"
              className="min-h-12 text-destructive"
              disabled={pending}
              onClick={() => {
                changed();
                setDialog('DELETE');
              }}
            >
              {t.catalogDelete}
            </Button>
          )}
        </div>
      )}
      {dialog && (
        <section
          role="region"
          aria-label={dialog === 'DELETE' ? t.catalogDelete : t.catalogMerge}
          className="grid gap-4 rounded-xl border p-4"
        >
          <p className="font-medium">
            {dialog === 'DELETE' ? t.catalogDeleteConfirm : t.catalogMergeConfirm}
          </p>
          {dialog === 'MERGE' && (
            <>
              <SearchField
                label={t.catalogSearch}
                value={query}
                onChange={(value) => {
                  setRequest(crypto.randomUUID());
                  setQuery(value);
                  setTarget('');
                }}
              />
              <label className="grid gap-2">
                {t.catalogMerge}
                <select
                  className={control}
                  value={target}
                  onChange={(e) => {
                    setRequest(crypto.randomUUID());
                    setTarget(e.target.value);
                  }}
                >
                  <option value="">{t.catalogChoose}</option>
                  {targets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {t[p.unit]}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="grid gap-3 text-sm">
                  <p className="break-words font-semibold">
                    {item?.name} → {selected.name}
                  </p>
                  <p>
                    {t.category}:{' '}
                    {
                      catalog.categories.find((c) => c.id === selected.category_id)?.[
                        `name_${locale}`
                      ]
                    }{' '}
                    · {t.itemUnit}: {t[selected.unit]}
                  </p>
                  {selected.unit !== item?.unit && (
                    <p role="alert" className="text-destructive">
                      {t.catalogUnitConflict}
                    </p>
                  )}
                  <p>{t.mergeTargetSettings}</p>
                  {item &&
                    catalog.balances &&
                    mergePreview(item.id, selected.id, catalog.balances, catalog.locations).map(
                      (row) => (
                        <div key={row.location} className="rounded-lg border p-3">
                          <p className="font-medium">
                            {row.location}: {row.quantity} {t[selected.unit]}
                          </p>
                          <p>
                            {t.minimum}: {row.minimum ?? t.uxNoMinimum}
                          </p>
                          {row.sourceMinimum !== null && row.minimum === null && (
                            <p className="font-medium text-destructive">{t.mergeMinimumLost}</p>
                          )}
                          <p>
                            {t.target}: {row.target ?? t.notSet}
                          </p>
                        </div>
                      ),
                    )}
                  <p>{t.mergeNoUndo}</p>
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="min-h-12"
              disabled={pending}
              onClick={() => {
                setDialog(null);
                setError('');
              }}
            >
              {t.cancel}
            </Button>
            <Button
              variant="destructive"
              className="min-h-12"
              disabled={
                pending || (dialog === 'MERGE' && (!selected || selected.unit !== item?.unit))
              }
              onClick={() => save(dialog)}
            >
              {dialog === 'DELETE' ? t.catalogDelete : t.catalogMergeAction}
            </Button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {errors[error] ?? t.catalogFailed}
        </p>
      )}
      <Link href="/items" className="flex min-h-12 items-center underline">
        {t.catalogTitle}
      </Link>
    </div>
  );
}
