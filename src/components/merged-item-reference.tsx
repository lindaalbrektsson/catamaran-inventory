import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export type MergedItemReference = {
  source_name: string;
  target_name: string;
  target_id: string;
  target_active: boolean;
};
export function MergedItemNotice({
  value,
  locale,
}: {
  value: MergedItemReference;
  locale: Locale;
}) {
  const t = dictionary(locale);
  return (
    <p className="text-sm">
      {t.mergePreviousItem}: {value.source_name} · {t.mergeInto}{' '}
      {value.target_active ? (
        <Link className="underline" href={`/items/${value.target_id}`}>
          {value.target_name}
        </Link>
      ) : (
        value.target_name
      )}
    </p>
  );
}
