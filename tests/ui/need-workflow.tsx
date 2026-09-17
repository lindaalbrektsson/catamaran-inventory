import { useEffect, useState } from 'react';
import { NeedFilters } from '@/components/need-filters';
import { NeedProgress } from '@/components/need-progress';
import { dictionary, type Locale } from '@/lib/i18n';

// Isolated browser fixture; no Supabase credentials, API or production writes.
export function NeedWorkflowFixture({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState('PENDING');
  const [itemStatus, setItemStatus] = useState<'PENDING' | 'ORDERED' | 'DONE'>('PENDING');
  const t = dictionary(locale);
  useEffect(() => {
    const navigate = (e: Event) => {
      setStatus(
        new URL((e as CustomEvent<string>).detail, location.origin).searchParams.get('status') ??
          '',
      );
    };
    const saved = () => setItemStatus((value) => (value === 'PENDING' ? 'ORDERED' : 'DONE'));
    window.addEventListener('fixture-navigation', navigate);
    window.addEventListener('fixture-need-saved', saved);
    return () => {
      window.removeEventListener('fixture-navigation', navigate);
      window.removeEventListener('fixture-need-saved', saved);
    };
  }, []);
  return (
    <>
      <NeedFilters locale={locale} filters={{ status }} locations={[]} products={[]} />
      {!status || status === itemStatus ? (
        <article>
          <h2>Shopping fixture</h2>
          <NeedProgress
            key={itemStatus}
            id="90000000-0000-4000-8000-000000000001"
            version={1}
            status={itemStatus}
            locale={locale}
          />
        </article>
      ) : (
        <p>{t.needEmpty}</p>
      )}
    </>
  );
}
