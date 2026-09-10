import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { can } from '@/lib/domain';
import { getSpendingOptions, readSpendingKind } from '@/lib/spending';
import { SpendingForm } from '@/components/spending-form';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
export default async function NewExpense({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const kind = readSpendingKind((await searchParams).kind);
  if (!can(profile.role, kind === 'EXPENSE' ? 'expenses.create' : 'purchases.capture')) notFound();
  const options = await getSpendingOptions();
  return (
    <div className="page max-w-2xl">
      <PageHeader
        title={kind === 'EXPENSE' ? t.newExpense : t.purchaseCapture}
        back="/expenses"
        locale={locale}
      />
      {options?.locations.length && options.categories.length ? (
        <div className="rounded-xl border bg-card p-5">
          <SpendingForm
            locale={locale}
            kind={kind}
            requestId={crypto.randomUUID()}
            currentUser={profile.id}
            {...options}
          />
        </div>
      ) : (
        <EmptyState title={t.spendingSetup} hint={t.spendingSetupHint} />
      )}
    </div>
  );
}
