import { redirect } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { CategoryEditor } from '@/components/category-editor';
export default async function Categories() {
  const p = await requireProfile();
  if (p.role !== 'OWNER') redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const categories = await collect((a, b) =>
    db.from('categories').select('*').order('name_en').range(a, b),
  );
  return (
    <div className="page hidden md:block">
      <h1 className="mb-5 text-2xl font-semibold">{t.configureCategories}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((category) => (
          <CategoryEditor key={category.id} category={category} locale={locale} />
        ))}
        <CategoryEditor
          category={{ id: crypto.randomUUID(), name_en: '', name_es: '', active: true }}
          locale={locale}
        />
      </div>
    </div>
  );
}
