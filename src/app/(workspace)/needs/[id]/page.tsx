import Link from 'next/link';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/server';
import { needCatalog } from '@/lib/item-catalog';
import { validId } from '@/lib/inventory';
import { NeedForm } from '@/components/need-form';
import { LocalTime } from '@/components/local-time';
import { PageHeader } from '@/components/page-header';
export default async function NeedDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const { id } = await params;
  validId(id);
  const locale = await getLocale(),
    t = dictionary(locale),
    db = await supabase();
  const { data: n, error } = await db.from('purchase_needs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('NEED_LOAD_FAILED');
  if (!n) notFound();
  const catalog = await needCatalog();
  const { data: actors, error: actorError } = await db
    .from('profiles')
    .select('id,display_name')
    .in('id', [n.created_by, n.updated_by]);
  if (actorError) throw new Error('ACTORS_LOAD_FAILED');
  return (
    <div className="page">
      <PageHeader
        title={catalog.products.find((p) => p.id === n.product_id)?.name ?? n.name}
        back="/needs"
        locale={locale}
      />
      <div className="mb-5 grid gap-2 text-sm">
        <p>
          {t.needCreated}: {actors.find((a) => a.id === n.created_by)?.display_name ?? t.notSet} ·{' '}
          <LocalTime value={n.created_at} locale={locale} />
        </p>
        <p>
          {t.needUpdated}: {actors.find((a) => a.id === n.updated_by)?.display_name ?? t.notSet} ·{' '}
          <LocalTime value={n.updated_at} locale={locale} />
        </p>
      </div>
      {n.product_url && (
        <a
          href={n.product_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex min-h-12 items-center underline"
        >
          {t.needOpenLink}
        </a>
      )}
      {(n.photo_ready || n.current_photo_id) && (
        <Link href={`/need-image/${n.id}`} target="_blank" className="mb-5 block max-w-sm">
          <Image
            src={`/need-image/${n.id}`}
            alt={t.needPhotoOpen}
            width={360}
            height={300}
            unoptimized
            className="max-h-80 rounded-xl object-contain"
          />
        </Link>
      )}
      <h2 className="mb-4 font-semibold">{t.needEdit}</h2>
      <NeedForm
        locale={locale}
        catalog={catalog}
        id={n.id}
        initial={n}
        requestId={crypto.randomUUID()}
      />
    </div>
  );
}
