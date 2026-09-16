import { InstallControls } from '@/components/pwa-support';
import { getLocale } from '@/lib/auth';
export default async function Install() {
  return (
    <main className="page max-w-2xl">
      <InstallControls locale={await getLocale()} keepInstructions />
    </main>
  );
}
