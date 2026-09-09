import Link from 'next/link';
import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
export default async function NotFound() {
  const t = dictionary(await getLocale());
  return (
    <div className="page">
      <h1 className="page-title">{t.notFound}</h1>
      <p className="my-5 text-muted-foreground">{t.notFoundHint}</p>
      <Button asChild>
        <Link href="/">{t.home}</Link>
      </Button>
    </div>
  );
}
