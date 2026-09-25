import { AppBack } from '@/components/app-back';
import { InstallControls } from '@/components/pwa-support';
import { getLocale } from '@/lib/auth';
export default async function Install() {
  const locale = await getLocale();
  return (
    <main className="page max-w-2xl">
      <AppBack locale={locale} />
      <InstallControls locale={locale} keepInstructions />
    </main>
  );
}
