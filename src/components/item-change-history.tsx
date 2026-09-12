import { dictionary, type Locale } from '@/lib/i18n';
import { LocalTime } from './local-time';
export type ItemChange = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor: string | null;
  location: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};
export function ItemChangeHistory({
  events,
  locale,
  categories,
}: {
  events: ItemChange[];
  locale: Locale;
  categories: { id: string; name_en: string; name_es: string }[];
}) {
  const t = dictionary(locale);
  const labels = {
    name: t.itemName,
    category_id: t.category,
    unit: t.itemUnit,
    active: t.itemActive,
    minimum_stock: t.minimumQuantity,
    target_stock: t.itemTarget,
  };
  function display(key: string, value: unknown) {
    if (value === undefined || value === null || value === '') return t.notSet;
    if (key === 'active') return value ? t.itemActive : t.inactive;
    if (key === 'category_id')
      return (
        categories.find((c) => c.id === value)?.[locale === 'es' ? 'name_es' : 'name_en'] ??
        t.notSet
      );
    if (key === 'unit' && typeof value === 'string' && value in t)
      return t[value as keyof typeof t];
    return String(value);
  }
  return (
    <div className="grid gap-4">
      {events.length === 0 && <p>{t.noActivity}</p>}
      {events.map((event) => (
        <article key={event.id} className="rounded-xl border bg-card p-4">
          <p className="font-medium">{event.actor ?? t.notSet}</p>
          <p className="text-sm">
            <LocalTime value={event.created_at} locale={locale} />
            {event.location && ` · ${event.location}`}
          </p>
          <dl className="mt-3 grid gap-3">
            {Object.entries(labels)
              .filter(
                ([key]) => JSON.stringify(event.before[key]) !== JSON.stringify(event.after[key]),
              )
              .map(([key, label]) => (
                <div key={key}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="break-words">
                    {t.auditBefore}: {display(key, event.before[key])}
                  </dd>
                  <dd className="break-words">
                    {t.auditAfter}: {display(key, event.after[key])}
                  </dd>
                </div>
              ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
