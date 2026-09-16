import 'server-only';
import webpush from 'web-push';
import { subscriptionSchema } from './push-domain';
import { dictionary, type Locale } from './i18n';
export function pushConfigured() {
  return Boolean(
    process.env.WEB_PUSH_PUBLIC_KEY &&
    process.env.WEB_PUSH_PRIVATE_KEY &&
    process.env.WEB_PUSH_SUBJECT,
  );
}
export async function deliverPush(
  subscription: unknown,
  locale: Locale,
  task?: string,
  reminderTitle?: string,
  maintenanceCount?: number,
): Promise<'SENT' | 'EXPIRED' | 'FAILED'> {
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success || !pushConfigured()) return 'FAILED';
  const t = dictionary(locale);
  try {
    await webpush.sendNotification(
      parsed.data,
      JSON.stringify({
        title: t.appName,
        body: maintenanceCount
          ? t.maintenancePush.replace('{count}', String(maintenanceCount))
          : task
            ? reminderTitle
              ? `${t.taskReminder}: ${reminderTitle.slice(0, 150)}`
              : t.pushReminderText
            : t.pushTestText,
        url: maintenanceCount
          ? '/tasks/maintenance?tab=recurring'
          : task
            ? `/tasks/${task}`
            : '/notifications',
        tag: maintenanceCount ? 'maintenance-due' : task ? `task-${task}` : 'push-test',
      }),
      {
        TTL: 3600,
        timeout: 5000,
        urgency: 'normal',
        vapidDetails: {
          subject: process.env.WEB_PUSH_SUBJECT!,
          publicKey: process.env.WEB_PUSH_PUBLIC_KEY!,
          privateKey: process.env.WEB_PUSH_PRIVATE_KEY!,
        },
      },
    );
    return 'SENT';
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    return status === 404 || status === 410 ? 'EXPIRED' : 'FAILED';
  }
}
