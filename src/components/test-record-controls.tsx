import { requireProfile } from '@/lib/auth';
import type { Locale } from '@/lib/i18n';
import { DeleteTestData, TestBadge } from './test-data';
export async function TestRecordControls({
  table,
  record,
  locale,
  back,
}: {
  table: string;
  record: {
    id: string;
    is_test?: boolean;
    created_by?: string | null;
    uploaded_by?: string | null;
  };
  locale: Locale;
  back: string;
}) {
  if (!record.is_test) return null;
  const p = await requireProfile();
  const allowed =
    p.role === 'OWNER' ||
    (p.role === 'MANAGER' && p.id === (record.created_by ?? record.uploaded_by));
  return (
    <div className="my-3 grid gap-3">
      <TestBadge value />
      {allowed && <DeleteTestData table={table} id={record.id} locale={locale} back={back} />}
    </div>
  );
}
