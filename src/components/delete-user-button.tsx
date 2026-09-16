'use client';
import { useState, useTransition } from 'react';
import { deleteUser } from '@/lib/delete-user';
import { dictionary, type Locale, type Key } from '@/lib/i18n';
export function DeleteUserButton({ target, locale }: { target: string; locale: Locale }) {
  const t = dictionary(locale);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<Key>();
  const [pending, start] = useTransition();
  return (
    <div>
      {!confirm ? (
        <button
          type="button"
          className="min-h-11 px-3 text-sm text-destructive"
          onClick={() => setConfirm(true)}
        >
          {t.deleteUser}
        </button>
      ) : (
        <section aria-label={t.deleteUserConfirm} className="rounded-xl border p-4">
          <p>{t.deleteUserConfirm}</p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              className="min-h-11 px-3"
              onClick={() => setConfirm(false)}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 px-3 text-destructive"
              onClick={() =>
                start(async () => {
                  const result = await deleteUser(target);
                  setMessage(
                    result.error ?? (result.preserved ? 'userHistoryPreserved' : 'userDeleted'),
                  );
                  if (result.success) setConfirm(false);
                })
              }
            >
              {t.deleteUser}
            </button>
          </div>
        </section>
      )}
      {message && <p role="status">{t[message]}</p>}
    </div>
  );
}
