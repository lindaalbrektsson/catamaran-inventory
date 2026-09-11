'use client';
import { useActionState } from 'react';
import { saveCategory } from '@/lib/catalog-actions';
import type { Category } from '@/lib/database.types';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import { Button } from './ui/button';
export function CategoryEditor({ category, locale }: { category: Category; locale: Locale }) {
  const t = dictionary(locale),
    [state, action, pending] = useActionState(saveCategory, {});
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
        />
      </label>
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
