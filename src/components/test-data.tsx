'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dictionary, type Locale } from '@/lib/i18n';
import { deleteTestData } from '@/lib/test-data-actions';
export { TestBadge } from './test-badge';
import { Button } from './ui/button';

export function TestDataField({
  locale,
  onChange,
  disabled = false,
}: {
  locale: Locale;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  const t = dictionary(locale);
  return (
    <div className="grid gap-1">
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          name="is_test"
          defaultChecked={false}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {t.testData}
      </label>
      <p className="text-xs text-muted-foreground">{t.testDataHelp}</p>
    </div>
  );
}
export function DeleteTestData({
  table,
  id,
  locale,
  back,
}: {
  table: string;
  id: string;
  locale: Locale;
  back: string;
}) {
  const t = dictionary(locale),
    router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
        {t.deleteTestData}
      </Button>
      {confirm && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={t.deleteTestData}
          className="grid gap-3 rounded-xl border p-4"
        >
          <p>{t.deleteTestConfirm}</p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    const result = await deleteTestData(table, id);
                    if (result.error) setError(t[result.error]);
                    else {
                      router.push(back);
                      router.refresh();
                    }
                  } catch {
                    setError(t.testDeleteBlocked);
                  }
                })
              }
            >
              {pending ? t.saving : t.deleteTestData}
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
