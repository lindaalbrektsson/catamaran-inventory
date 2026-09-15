'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveInventoryItem } from '@/lib/catalog-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';

export function ArchiveItem({ productId, locale }: { productId: string; locale: Locale }) {
  const t = dictionary(locale),
    router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<'error' | 'success' | null>(null);
  const [pending, startTransition] = useTransition();
  if (result === 'success') return <p role="status">{t.itemArchived}</p>;
  return (
    <div className="mb-5">
      {!confirming ? (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          {t.archiveItem}
        </Button>
      ) : (
        <div className="rounded-xl border p-4" role="group" aria-label={t.archiveItem}>
          <p className="mb-4">{t.archiveItemConfirm}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(null);
                  try {
                    const response = await archiveInventoryItem(productId);
                    if (!response.success) {
                      setResult('error');
                      return;
                    }
                    setResult('success');
                    router.refresh();
                  } catch {
                    setResult('error');
                  }
                })
              }
            >
              {t.archiveItem}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setResult(null);
              }}
            >
              {t.cancel}
            </Button>
          </div>
          {result === 'error' && (
            <p role="alert" className="mt-3">
              {t.errorHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
