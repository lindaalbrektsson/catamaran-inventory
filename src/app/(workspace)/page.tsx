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
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const canUseNeeds = ['OWNER', 'MANAGER'].includes(profile.role);
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
  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">{t.brand}</h1>
      {profile.role === 'OWNER' && (
        <Link
          href="/inventory/overview"
          className="mb-5 hidden rounded-xl border p-4 md:inline-flex"
        >
          {t.ownerWorkspace}
        </Link>
      )}
      <LocationCards
        locations={await getLocations()}
        locale={locale}
        canAdd={can(profile.role, 'inventory.add')}
      />
      {canUseNeeds && (
        <section className="mt-4 rounded-2xl border bg-card p-5" aria-labelledby="home-needs">
          <div className="flex min-h-14 items-center gap-4">
            <ShoppingBag aria-hidden="true" className="size-7 text-primary" />
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
            <ReceiptText aria-hidden="true" className="size-7 text-primary" />
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
      <TaskList
        {...await taskSummary()}
        locale={locale}
        actorId={profile.id}
        now={new Date().toISOString()}
        home
        canManage={canUseNeeds}
      />
      <DocumentList
        documents={await getDocuments()}
        locale={locale}
        owner={profile.role === 'OWNER'}
        home
        now={new Date().toISOString()}
      />
    </div>
  );
}
