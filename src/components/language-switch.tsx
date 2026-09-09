'use client';
import { useFormStatus } from 'react-dom';
import { setLanguage } from '@/lib/actions';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';
function Toggle({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus(),
    t = dictionary(locale);
  return (
    <Button
      variant="ghost"
      type="submit"
      name="language"
      value={locale === 'en' ? 'es' : 'en'}
      disabled={pending}
      aria-label={t.language}
    >
      {pending ? t.working : locale === 'en' ? t.es : t.en}
    </Button>
  );
}
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <form action={setLanguage}>
      <Toggle locale={locale} />
    </form>
  );
}
