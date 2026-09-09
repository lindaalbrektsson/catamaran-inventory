import { redirect } from 'next/navigation';
import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { isConfigured } from '@/lib/supabase/config';
import { PublicFrame } from '@/components/public-frame';
import { Plug } from 'lucide-react';
export default async function Setup() {
  if (isConfigured()) redirect('/');
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <PublicFrame locale={locale}>
      <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
        <Plug aria-hidden="true" className="size-7" />
      </div>
      <h1 className="page-title">{t.setupTitle}</h1>
      <p className="mt-4 text-muted-foreground leading-7">{t.setupHint}</p>
      <ol className="my-8 space-y-5">
        {[t.setupStep1, t.setupStep2, t.setupStep3].map((step, i) => (
          <li className="flex items-start gap-4 text-sm leading-6" key={step}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="border-t pt-5 text-xs leading-6 text-muted-foreground">{t.setupNote}</p>
    </PublicFrame>
  );
}
