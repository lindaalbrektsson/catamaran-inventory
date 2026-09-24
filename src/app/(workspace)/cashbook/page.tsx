import { notFound } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { hasCashbookAccess, cashbookData } from '@/lib/cashbook';
import { CashbookWorkspace } from '@/components/cashbook';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';

export default async function CashbookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  if (!(await hasCashbookAccess())) notFound();
  const params = await searchParams;
  const initialAction = typeof params.action === 'string' ? params.action : undefined;
  const [locale, data] = await Promise.all([
    getLocale(),
    cashbookData({ ...params, ...(initialAction === 'FOOD' ? { view: 'payments' } : {}) }),
  ]);
  return (
    <div className="page max-w-5xl">
      <PageHeader title={dictionary(locale).cashbook} locale={locale} />
      <CashbookWorkspace
        key={initialAction ?? 'default'}
        initialAction={initialAction}
        locale={locale}
        data={data}
        isOwner={profile.role === 'OWNER'}
      />
    </div>
  );
}
