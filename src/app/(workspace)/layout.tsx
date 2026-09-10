import { requireProfile, getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { Brand } from '@/components/brand';
import { Navigation } from '@/components/navigation';
import { LanguageSwitch } from '@/components/language-switch';
import { ShieldCheck } from 'lucide-react';
export default async function Workspace({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:p-4"
      >
        {t.skip}
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-card p-6 md:flex">
        <Brand locale={locale} />
        <p className="eyebrow mb-4 mt-12">{t.workspace}</p>
        <Navigation locale={locale} />
        <div className="mt-auto border-t pt-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">
              {profile.display_name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.display_name}</p>
              <p className="text-xs text-muted-foreground">{t[profile.role]}</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-content md:ml-64">
        <header className="flex h-20 items-center justify-between border-b bg-card px-5 md:px-10">
          <div className="md:hidden">
            <Brand locale={locale} />
          </div>
          <p className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {t.session}
          </p>
          <LanguageSwitch locale={locale} />
        </header>
        <main id="main">{children}</main>
      </div>
      <div className="md:hidden">
        <Navigation locale={locale} />
      </div>
    </div>
  );
}
