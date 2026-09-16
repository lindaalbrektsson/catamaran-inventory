import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { getDocuments, documentPeople } from '@/lib/documents';
import { DocumentForm } from '@/components/document-form';
import { PageHeader } from '@/components/page-header';
import { dictionary } from '@/lib/i18n';
export default async function NewDocument() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) notFound();
  const locale = await getLocale(),
    [docs, people] = await Promise.all([
      getDocuments(),
      p.role === 'OWNER' ? documentPeople() : Promise.resolve([]),
    ]);
  return (
    <div className="page">
      <PageHeader title={dictionary(locale).docUpload} back="/documents" locale={locale} />
      <DocumentForm
        owner={p.role === 'OWNER'}
        locale={locale}
        id={crypto.randomUUID()}
        requestId={crypto.randomUUID()}
        people={people}
        categories={[...new Set(docs.map((d) => d.category).filter(Boolean))]}
      />
    </div>
  );
}
