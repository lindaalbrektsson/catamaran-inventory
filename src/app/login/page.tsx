import { redirect } from 'next/navigation';
import { getLocale,getProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { isConfigured } from '@/lib/supabase/config';
import { PublicFrame } from '@/components/public-frame';
import { LoginForm } from '@/components/login-form';
export default async function Login() {
  if(!isConfigured()) redirect('/setup');
  if(await getProfile()) redirect('/');
  const locale=await getLocale(),t=dictionary(locale);
  return <PublicFrame locale={locale}><p className="eyebrow mb-4">{t.operations}</p><h1 className="page-title">{t.welcome}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{t.authHint}</p><LoginForm locale={locale}/></PublicFrame>;
}
