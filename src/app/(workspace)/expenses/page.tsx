import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
export default async function Expenses() {
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <PageHeader title={t.expenses} locale={locale} />
      <EmptyState title={t.expensesPending} hint={t.expensesPendingHint} />
    </div>
  );
}
