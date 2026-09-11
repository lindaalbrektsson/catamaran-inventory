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
    <form action={action} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="requestId" value={request} />
      <button
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
      >
        {pending ? t.saving : status === 'PENDING' ? t.needMarkOrdered : t.needMarkDone}
      </button>
      {state.error && <p role="alert">{t[state.error]}</p>}
    </form>
  );
}
