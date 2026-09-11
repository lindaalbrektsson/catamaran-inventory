import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { getDocuments, documentPeople } from '@/lib/documents';
import { DocumentForm } from '@/components/document-form';
import { DesktopOnly } from '@/components/desktop-only';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';
export default async function NewDocument() {
  const p = await requireProfile();
  if (p.role !== 'OWNER') notFound();
  const locale = await getLocale(),
    [docs, people] = await Promise.all([getDocuments(), documentPeople()]);
  return (
    <DesktopOnly locale={locale} back="/documents" backLabel={dictionary(locale).documents}>
      <div className="page">
        <PageHeader title={dictionary(locale).docUpload} back="/documents" locale={locale} />
        <DocumentForm
          locale={locale}
          id={crypto.randomUUID()}
          requestId={crypto.randomUUID()}
          people={people}
          categories={[...new Set(docs.map((d) => d.category).filter(Boolean))]}
        />
      </div>
    </DesktopOnly>
  );
}
