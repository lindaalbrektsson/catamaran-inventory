import { CashbookHomeCard } from '@/components/cashbook-entry-points';
import { ListSkeleton } from '@/components/list-skeleton';
import { MobileOnboarding } from '@/components/mobile-onboarding';
import { Suspense } from 'react';
import type { Locale } from '@/lib/i18n';
import { timed } from '@/lib/performance';
import { taskSummary } from '@/lib/tasks';
import { getDocuments } from '@/lib/documents';
import { DocumentList } from '@/components/document-list';
import { TaskList } from '@/components/task-list';
import { supabase } from '@/lib/supabase/server';
import { ShoppingBag, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { LocationCards } from '@/components/location-cards';
import { can } from '@/lib/domain';
export default async function Home() {
  return timed('route.home', renderHome);
}
async function renderHome() {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const canUseNeeds = ['OWNER', 'MANAGER'].includes(profile.role);
  // Start independent secondary reads now, but never hold location actions behind them.
  const tasks = timed('tasks.summary', taskSummary).catch(() => null);
  const documents = timed('documents.list', getDocuments).catch(() => null);
  const [locations, counts] = await Promise.all([
    getLocations(),
    timed('needs.summary', async () => {
      let pending = 0,
        ordered = 0;
      if (canUseNeeds) {
        const db = await supabase();
        const counts = await Promise.all(
          ['PENDING', 'ORDERED'].map((status) =>
            db
              .from('purchase_needs')
              .select('id', { count: 'exact', head: true })
              .eq('archived', false)
              .eq('status', status as 'PENDING' | 'ORDERED'),
          ),
        );
        if (counts.some((result) => result.error)) throw new Error('NEED_SUMMARY_LOAD_FAILED');
        pending = counts[0].count ?? 0;
        ordered = counts[1].count ?? 0;
      }
      return { pending, ordered };
    }),
  ]);
  const { pending, ordered } = counts;
  return (
    <div className="page">
      <div className="sea-lines-soft mb-4 rounded-xl px-1 py-2">
        <h1 className="eyebrow">{t.home}</h1>
      </div>
      {canUseNeeds && (
        <MobileOnboarding
          locale={locale}
          userId={profile.id}
          publicKey={
            process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT
              ? (process.env.WEB_PUSH_PUBLIC_KEY ?? '')
              : ''
          }
        />
      )}
      {profile.role === 'OWNER' && (
        <Link
          href="/inventory/overview"
          className="mb-5 hidden rounded-xl border p-4 md:inline-flex"
        >
          {t.ownerWorkspace}
        </Link>
      )}
      <LocationCards
        locations={locations}
        locale={locale}
        canAdd={can(profile.role, 'inventory.add')}
      />
      <Suspense fallback={null}>
        <CashbookHomeCard locale={locale} />
      </Suspense>
      {canUseNeeds && (
        <section className="mt-4 rounded-2xl border bg-card p-5" aria-labelledby="home-needs">
          <div className="flex min-h-14 items-center gap-4">
            <span className="domain-mark">
              <ShoppingBag aria-hidden="true" className="size-5" />
            </span>
            <h2 id="home-needs" className="text-xl font-semibold">
              {t.needsTitle}
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {pending.toLocaleString(locale)} {t.needPending} · {ordered.toLocaleString(locale)}{' '}
            {t.ORDERED}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/needs"
              className="flex min-h-14 items-center justify-center rounded-xl border px-3 font-semibold"
            >
              {t.viewNeeds}
            </Link>
            <Link
              href="/needs/new"
              className="flex min-h-14 items-center justify-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
            >
              + {t.needNew}
            </Link>
          </div>
        </section>
      )}
      {can(profile.role, 'receipts.upload') && (
        <section className="mt-4 rounded-2xl border bg-card p-5" aria-labelledby="home-receipts">
          <div className="flex min-h-14 items-center gap-4">
            <span className="domain-mark">
              <ReceiptText aria-hidden="true" className="size-5" />
            </span>
            <h2 id="home-receipts" className="text-xl font-semibold">
              {t.receipts}
            </h2>
          </div>
          <Link
            href="/expenses/capture"
            className="mt-4 flex min-h-14 items-center justify-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
          >
            {t.addReceipt}
          </Link>
        </section>
      )}
      <Suspense fallback={<ListSkeleton label={`${t.tasksTitle}: ${t.loading}`} rows={2} />}>
        <HomeTasks data={tasks} locale={locale} actorId={profile.id} canManage={canUseNeeds} />
      </Suspense>
      <Suspense fallback={<ListSkeleton label={`${t.documents}: ${t.loading}`} rows={2} />}>
        <HomeDocuments
          userId={profile.id}
          data={documents}
          locale={locale}
          owner={profile.role === 'OWNER'}
        />
      </Suspense>
    </div>
  );
}

function SecondaryFailure({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  return (
    <div role="alert" className="mt-4 rounded-xl border p-4">
      <p>{t.errorTitle}</p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Explicit reload retries failed secondary reads. */}
      <a className="inline-flex min-h-12 items-center underline" href="/">
        {t.retry}
      </a>
    </div>
  );
}
async function HomeTasks({
  data,
  locale,
  actorId,
  canManage,
}: {
  data: Promise<Awaited<ReturnType<typeof taskSummary>> | null>;
  locale: Locale;
  actorId: string;
  canManage: boolean;
}) {
  const tasks = await data;
  return tasks ? (
    <TaskList
      {...tasks}
      locale={locale}
      actorId={actorId}
      canManage={canManage}
      home
      now={new Date().toISOString()}
    />
  ) : (
    <SecondaryFailure locale={locale} />
  );
}
async function HomeDocuments({
  userId,
  data,
  locale,
  owner,
}: {
  userId: string;
  data: Promise<Awaited<ReturnType<typeof getDocuments>> | null>;
  locale: Locale;
  owner: boolean;
}) {
  const documents = await data;
  return documents ? (
    <DocumentList
      userId={userId}
      documents={documents}
      locale={locale}
      owner={owner}
      home
      now={new Date().toISOString()}
    />
  ) : (
    <SecondaryFailure locale={locale} />
  );
}
