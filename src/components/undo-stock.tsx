'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reverseStock } from '@/lib/operational-actions';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
import { Button } from './ui/button';
export function UndoStock({ id, locale }: { id: string; locale: Locale }) {
  const t = dictionary(locale),
    router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState<Key>(),
    [request] = useState(() => crypto.randomUUID());
  return (
    <div className="mt-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await reverseStock(request, id);
              if (r.error) setError(r.error);
              else router.refresh();
            } catch {
              setError('UNKNOWN');
            }
          })
        }
      >
        {pending ? t.saving : t.undo}
      </Button>
      {error && <p role="alert">{t[error]}</p>}
    </div>
  );
}
