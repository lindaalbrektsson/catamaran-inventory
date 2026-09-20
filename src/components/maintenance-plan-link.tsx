import Link from 'next/link';
import type { MaintenanceCatalog } from '@/lib/maintenance';
import { dictionary, type Locale } from '@/lib/i18n';
export function MaintenancePlanLink({
  catalog,
  id,
  locale,
}: {
  catalog: MaintenanceCatalog;
  id: string;
  locale: Locale;
}) {
  const t = dictionary(locale),
    task = catalog.tasks.find((x) => x.id === id),
    rule = catalog.rules.find((x) => x.task_id === id);
  if (!task || !rule || task.archived || task.status === 'DONE') return null;
  if (catalog.occurrences.some((o) => o.task_id === id && o.status !== 'DONE'))
    return (
      <p role="status" className="my-3 rounded-xl bg-secondary p-3 font-medium">
        {t.maintenancePlanned}
      </p>
    );
  const due =
    rule.recurrence === 'NONE' ||
    (!!rule.next_due &&
      (rule.next_due < catalog.today ||
        (rule.next_due === catalog.today && (rule.due_time ?? '00:00:00') <= catalog.clock)));
  return due ? (
    <Link
      className="my-3 inline-flex min-h-12 items-center rounded-xl border px-3"
      href={'/tasks/maintenance/plan?task=' + id}
    >
      {t.usabilityPlanToday}
    </Link>
  ) : null;
}
