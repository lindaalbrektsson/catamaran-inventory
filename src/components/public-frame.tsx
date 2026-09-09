import { Brand } from './brand';
import { LanguageSwitch } from './language-switch';
import { dictionary, type Locale } from '@/lib/i18n';
import { Anchor, ShieldCheck } from 'lucide-react';
export function PublicFrame({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = dictionary(locale);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[0.85fr_1.15fr]">
      <aside className="sea-lines hidden flex-col justify-between bg-primary p-12 text-white md:flex">
        <Brand locale={locale} inverse />
        <div className="my-16">
          <Anchor className="mb-7 size-12 stroke-1" aria-hidden="true" />
          <h1 className="max-w-lg text-5xl font-medium leading-tight tracking-tight">
            {t.inventoryIntro}
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-white/75">{t.homeIntro}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/75">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t.inventoryFoundation}
        </div>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between p-5 md:justify-end md:px-10">
          <div className="md:hidden">
            <Brand locale={locale} />
          </div>
          <LanguageSwitch locale={locale} />
        </header>
        <main id="main" className="m-auto w-full max-w-lg px-6 pb-12 pt-8 md:px-10">
          {children}
        </main>
        <footer className="px-6 pb-7 text-center text-xs text-muted-foreground">
          {t.brand} · {t.operations}
        </footer>
      </div>
    </div>
  );
}
