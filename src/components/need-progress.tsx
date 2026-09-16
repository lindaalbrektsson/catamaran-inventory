'use client';
import { useActionState, useState } from 'react';
import { advanceNeed } from '@/lib/quick-actions';
import { dictionary, type Locale } from '@/lib/i18n';
export function NeedProgress({
  id,
  version,
  status,
  locale,
}: {
  id: string;
  version: number;
  status: 'PENDING' | 'ORDERED' | 'DONE';
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(advanceNeed, {}),
    [request] = useState(() => crypto.randomUUID()),
    t = dictionary(locale);
  if (status === 'DONE') return null;
  return (
    <form action={action} className="w-28 shrink-0 sm:w-32">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="requestId" value={request} />
      <button
        disabled={pending}
        className="min-h-11 w-full rounded-lg border border-primary/20 bg-secondary px-2 py-2 text-sm font-medium leading-tight text-primary"
      >
        {pending ? t.saving : status === 'PENDING' ? t.needMarkOrdered : t.needMarkDone}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 break-words text-xs text-destructive">
          {t[state.error]}
        </p>
      )}
    </form>
  );
}
