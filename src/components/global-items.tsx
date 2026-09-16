'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ItemCatalog } from '@/lib/item-domain';
import type { Product } from '@/lib/database.types';
import { dictionary, type Locale } from '@/lib/i18n';
import { normalizedName } from '@/lib/quick-domain';
import { units } from '@/lib/domain';
import { manageGlobalItem } from '@/lib/global-items-actions';
import { Button } from './ui/button';

const control = 'min-h-12 w-full rounded-xl border bg-background p-3';
export function GlobalItems({ catalog, locale }: { catalog: ItemCatalog; locale: Locale }) {
  const t = dictionary(locale),
    [query, setQuery] = useState('');
  const items = catalog.products.filter(
    (p) => p.active && normalizedName(p.name).includes(normalizedName(query)),
  );
  return (
    <div className="grid gap-4">
      <Button asChild className="min-h-12">
        <Link href="/items/new">{t.addItem}</Link>
      </Button>
      <label className="grid gap-2">
        {t.catalogSearch}
        <input
          className={control}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/items/${p.id}`} className="grid min-h-20 gap-1 rounded-xl border p-4">
              <span className="break-words font-semibold">{p.name}</span>
              <span className="text-sm text-muted-foreground">
                {catalog.categories.find((c) => c.id === p.category_id)?.[`name_${locale}`]} ·{' '}
                {t[p.unit]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!items.length && <p>{t.catalogEmpty}</p>}
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
              : { name, category, unit, confirmDuplicate: confirm },
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
              <label className="grid gap-2">
                {t.catalogSearch}
                <input
                  type="search"
                  className={control}
                  value={query}
                  onChange={(e) => {
                    setRequest(crypto.randomUUID());
                    setQuery(e.target.value);
                    setTarget('');
                  }}
                />
              </label>
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
                <p className="break-words">
                  {item?.name} → {selected.name}
                </p>
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
              disabled={pending || (dialog === 'MERGE' && !selected)}
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
