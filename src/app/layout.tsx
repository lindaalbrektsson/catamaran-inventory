import type { Metadata, Viewport } from 'next';
import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { PwaProvider } from '@/components/pwa-support';
import { SessionRefresh } from '@/components/session-refresh';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await getLocale());
  return {
    title: { default: t.appName, template: `%s · ${t.brand}` },
    description: t.signInHint,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t.brand },
    other: { 'apple-mobile-web-app-capable': 'yes' },
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#136b58',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionRefresh />
        <PwaProvider locale={locale} version={process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'}>
          {children}
        </PwaProvider>
      </body>
    </html>
  );
}
