import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, dateTime } from '@/lib/i18n';
import { can } from '@/lib/domain';
import { getSpendingList, readSpendingKind } from '@/lib/spending';
import { spendingPath } from '@/lib/spending-domain';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; page?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  if (!can(profile.role, 'expenses.read'))
    return (
      <div className="page">
        <EmptyState title={t.expenses} hint={t.spendingAccess} />
      </div>
    );
  const search = await searchParams,
    kind = readSpendingKind(search.kind);
  const page = /^[1-9]\d{0,4}$/.test(search.page ?? '') ? Number(search.page) : 1;
  const result = await getSpendingList(kind, page);
  return (
    <div className="page max-w-3xl">
      <PageHeader title={t.expenses} description={t.spendingIntro} locale={locale} />
      {result === null ? (
        <EmptyState title={t.spendingSetup} hint={t.spendingSetupHint} />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <Button asChild>
              <Link href="/expenses/new">{t.newExpense}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/expenses/new?kind=purchase">{t.purchaseCapture}</Link>
            </Button>
          </div>
          <div className="mb-5 flex flex-wrap gap-3">
            <Button variant={kind === 'EXPENSE' ? 'secondary' : 'outline'} asChild>
              <Link href="/expenses">{t.expenses}</Link>
            </Button>
            <Button variant={kind === 'PURCHASE' ? 'secondary' : 'outline'} asChild>
              <Link href="/expenses?kind=purchase">{t.purchaseDraft}</Link>
            </Button>
          </div>
          {!result.rows.length ? (
            <EmptyState title={t.noExpenses} hint={t.noExpensesHint} />
          ) : (
            <div className="grid gap-3">
              {result.rows.map((row) => (
                <Link
                  key={row.id}
                  href={spendingPath(row.id, kind)}
                  className="rounded-xl border bg-card p-5"
                >
                  <p className="font-semibold">
                    {row.category
                      ? locale === 'es'
                        ? row.category.name_es
                        : row.category.name_en
                      : t.notSet}
                  </p>
                  <p className="mt-2 text-2xl font-semibold break-all">
                    {new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: row.currency,
                      currencyDisplay: 'code',
                    }).format(row.amount)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{row.location ?? t.notSet}</p>
                  <time
                    className="mt-1 block text-xs text-muted-foreground"
                    dateTime={row.occurred_at}
                  >
                    {dateTime(row.occurred_at, locale)}
                  </time>
                  {kind === 'PURCHASE' && (
                    <p className="mt-2 text-xs text-primary">{t.purchaseDraft}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-5 flex justify-between gap-3">
            {page > 1 ? (
              <Button variant="outline" asChild>
                <Link href={`/expenses?kind=${kind.toLowerCase()}&page=${page - 1}`}>
                  {t.previous}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {result.hasNext && (
              <Button variant="outline" asChild>
                <Link href={`/expenses?kind=${kind.toLowerCase()}&page=${page + 1}`}>{t.next}</Link>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
