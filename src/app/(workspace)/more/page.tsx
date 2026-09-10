import { InstallControls } from '@/components/pwa-support';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { signOut } from '@/lib/actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageSwitch } from '@/components/language-switch';
export default async function More() {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page max-w-3xl">
      <PageHeader title={t.account} locale={locale} />
      <Card className="shadow-none">
        <CardContent className="divide-y p-5">
          <div className="pb-5">
            <h2 className="text-xl font-semibold">{profile.display_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t[profile.role]}</p>
            <p className="mt-4 text-sm text-muted-foreground">{t.scopeNote}</p>
          </div>
          <div className="flex items-center justify-between py-4">
            <span className="text-sm font-medium">{t.language}</span>
            <LanguageSwitch locale={locale} />
          </div>
          <form action={signOut} className="pt-5">
            <Button variant="outline">{t.signOut}</Button>
          </form>
        </CardContent>
      </Card>
      <InstallControls locale={locale} />
    </div>
  );
}
