import { DocumentForm } from '@/components/document-form';
import { DocumentList } from '@/components/document-list';
import { DesktopOnly } from '@/components/desktop-only';
import type { Locale } from '@/lib/i18n';
import type { OperationalDocument } from '@/lib/database.types';
const id = '70000000-0000-4000-8000-000000000001',
  person = '40000000-0000-4000-8000-000000000001';
const doc: OperationalDocument = {
  id,
  title: 'Fixture tour checklist',
  description: '',
  category: 'Operations',
  expiry_date: '2026-09-30',
  favorite: true,
  archived: false,
  access_level: 'STAFF',
  selected_users: [],
  current_file_id: id,
  version: 2,
  created_by: person,
  created_at: '2026-09-29T18:00:00Z',
  uploaded_by: person,
  uploaded_at: '2026-09-29T18:00:00Z',
  updated_by: person,
  updated_at: '2026-09-29T18:00:00Z',
};
export function DocumentsFixture({
  locale,
  view,
  owner,
}: {
  locale: Locale;
  view: string;
  owner: boolean;
}) {
  return view === 'document-form' ? (
    <DesktopOnly locale={locale}>
      <DocumentForm
        locale={locale}
        id={id}
        requestId={crypto.randomUUID()}
        people={[{ id: person, display_name: 'Fixture staff', active: true }]}
        categories={['Operations']}
      />
    </DesktopOnly>
  ) : (
    <DocumentList
      documents={[
        doc,
        {
          ...doc,
          id: '70000000-0000-4000-8000-000000000002',
          title: 'Archived fixture',
          archived: true,
        },
      ]}
      locale={locale}
      owner={owner}
      home={view === 'document-home'}
      now="2026-09-30T18:00:00Z"
    />
  );
}
