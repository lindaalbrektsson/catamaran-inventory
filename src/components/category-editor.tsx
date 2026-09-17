'use client';
import { useActionState, useState } from 'react';
import { saveCategory } from '@/lib/catalog-actions';
import type { Category } from '@/lib/database.types';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import { CategoryMark } from './category-mark';
import { categoryIcons, categoryAccents } from '@/lib/category-visuals';
import { Button } from './ui/button';
export function CategoryEditor({ category, locale }: { category: Category; locale: Locale }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(saveCategory, {});
  const [icon, setIcon] = useState(category.icon_key ?? ''),
    [accent, setAccent] = useState(category.accent_key ?? ''),
    [name, setName] = useState(category[`name_${locale}`]);
  return (
    <form action={action} className="grid gap-3 rounded-xl border p-4">
      <input type="hidden" name="id" value={category.id} />
      <label>
        {t.nameEnglish}
        <input
          className="mt-1 min-h-12 w-full rounded-xl border bg-background px-3"
          name="name_en"
          required
          maxLength={100}
          defaultValue={category.name_en}
          onChange={(e) => {
            if (locale === 'en') setName(e.target.value);
          }}
        />
      </label>
      <label>
        {t.nameSpanish}
        <input
          className="mt-1 min-h-12 w-full rounded-xl border bg-background px-3"
          name="name_es"
          required
          maxLength={100}
          defaultValue={category.name_es}
          onChange={(e) => {
            if (locale === 'es') setName(e.target.value);
          }}
        />
      </label>
      <label className="grid gap-2">
        {t.categoryIconLabel}
        <select name="icon_key" value={icon} onChange={(e) => setIcon(e.target.value)}>
          <option value="">{t.visualDefault}</option>
          {categoryIcons.map((key) => (
            <option key={key} value={key}>
              {t[`icon_${key}`]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="mb-2">{t.categoryAccentLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {(['', ...categoryAccents] as const).map((key) => (
            <label
              key={key}
              className="accent-option relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2"
            >
              <input
                type="radio"
                name="accent_key"
                value={key}
                checked={accent === key}
                onChange={() => setAccent(key)}
              />
              <span aria-hidden="true" className="accent-swatch" data-accent={key || 'neutral'} />
              <span className="text-sm">{key ? t[`accent_${key}`] : t.visualDefault}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div
        aria-label={t.categoryPreview}
        className="flex min-h-12 items-center gap-3 rounded-xl bg-muted p-3"
      >
        <CategoryMark category={{ icon_key: icon, accent_key: accent }} />
        <span className="break-words font-medium">{name || t.categoryPreview}</span>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={category.active} />
        {t.itemActive}
      </label>
      {state.error && <p role="alert">{t[state.error as Key]}</p>}
      {state.success && <p role="status">{t.categorySaved}</p>}
      <Button disabled={pending}>{pending ? t.saving : t.save}</Button>
    </form>
  );
}
