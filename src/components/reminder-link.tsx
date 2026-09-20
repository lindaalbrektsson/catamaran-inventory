import Link from 'next/link';
import { BellPlus } from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
export function ReminderLink({ taskId, locale }: { taskId: string; locale: Locale }) {
  return (
    <Link
      href={'/tasks/new?reminderFor=' + taskId}
      className="my-3 inline-flex min-h-12 items-center gap-2 rounded-xl border px-3"
    >
      <BellPlus aria-hidden="true" className="size-4" />
      {dictionary(locale).usabilityReminder}
    </Link>
  );
}
