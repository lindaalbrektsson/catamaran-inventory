import { useState } from 'react';
import { TaskUpdateHistory } from '@/components/task-update-history';
import { TaskUpdateForm } from '@/components/task-update-form';
import { VoicePlayer } from '@/components/voice-recorder';
import type { Locale } from '@/lib/i18n';
export function VoiceFixture({ locale }: { locale: Locale }) {
  const [saved] = useState(() => JSON.parse(localStorage.getItem('voice-fixture') ?? 'null'));
  return (
    <>
      <TaskUpdateHistory task="50000000-0000-4000-8000-000000000001" locale={locale} people={[]} />
      <TaskUpdateForm task="50000000-0000-4000-8000-000000000001" locale={locale} />
      {saved?.voice && (
        <section aria-label="Saved update">
          <p>{saved.body}</p>
          <VoicePlayer src={saved.voice} duration={saved.duration} locale={locale} />
        </section>
      )}
    </>
  );
}
