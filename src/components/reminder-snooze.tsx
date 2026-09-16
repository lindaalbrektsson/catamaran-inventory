'use client';
import { useActionState, useState } from 'react';
import { snoozeReminder } from '@/lib/task-actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { MobilePwaOnly } from './mobile-pwa-only';
export function ReminderSnooze({
  id,
  actorId,
  version,
  locale,
}: {
  id: string;
  actorId: string;
  version: number;
  locale: Locale;
}) {
  const [minutes, setMinutes] = useState('30'),
    [time, setTime] = useState('09:00');
  const t = dictionary(locale),
    [state, action, pending] = useActionState(snoozeReminder, {});
  return (
    <MobilePwaOnly>
      <form
        action={action}
        onSubmit={() => {
          if (minutes === '1440')
            try {
              localStorage.setItem(`belize-tomorrow-snooze:${actorId}`, time);
            } catch {}
        }}
        className="my-4 grid gap-3"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <label className="grid gap-2">
          {t.snooze}
          <select
            name="minutes"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              if (e.target.value === '1440')
                try {
                  const saved = localStorage.getItem(`belize-tomorrow-snooze:${actorId}`);
                  if (saved && /^([01]\d|2[0-3]):[0-5]\d$/.test(saved)) setTime(saved);
                } catch {}
            }}
            className="min-h-12 rounded-xl border bg-background p-3"
          >
            {([30, 60, 120, 240, 1440] as const).map((n) => (
              <option key={n} value={n}>
                {t[`snooze${n}`]}
              </option>
            ))}
          </select>
        </label>
        {minutes === '1440' ? (
          <label className="grid gap-2">
            {t.reminderTimeBelize}
            <input
              type="time"
              name="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="min-h-12 rounded-xl border bg-background p-3"
            />
          </label>
        ) : (
          <input type="hidden" name="time" value={time} />
        )}
        <button disabled={pending} className="min-h-12 rounded-xl border p-3">
          {t.snooze}
        </button>
        {state.error && <p role="alert">{t[state.error]}</p>}
      </form>
    </MobilePwaOnly>
  );
}
