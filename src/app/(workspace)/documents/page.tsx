import { getLocale, requireProfile } from '@/lib/auth';
import { getDocuments } from '@/lib/documents';
import { DocumentList } from '@/components/document-list';
export default async function Documents() {
  const p = await requireProfile(),
    locale = await getLocale();
  return (
    <div className="page">
      <DocumentList
        documents={await getDocuments()}
        locale={locale}
        owner={p.role === 'OWNER'}
        now={new Date().toISOString()}
      />
    </div>
  );
}
