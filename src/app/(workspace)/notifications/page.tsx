import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { pushConfigured } from '@/lib/push-sender';
import { NotificationSettings } from '@/components/notification-settings';
export default async function Notifications() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) notFound();
  return (
    <div className="page max-w-xl">
      <NotificationSettings
        locale={await getLocale()}
        publicKey={pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY! : ''}
      />
    </div>
  );
}
