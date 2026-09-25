'use client';
import { createContext, useContext, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canGoBackInApp, showWorkspaceBack, trackAppHistory } from '@/lib/app-history';
import { dictionary, type Locale } from '@/lib/i18n';
const WorkspaceBackContext = createContext(false);
export function AppHistory({ children }: { children: React.ReactNode }) {
  useEffect(trackAppHistory, []);
  return children;
}
export function AppBack({ locale }: { locale: Locale }) {
  const router = useRouter();
  return (
    <Link
      href="/"
      prefetch={false}
      className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        if (canGoBackInApp()) router.back();
        else router.replace('/');
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {dictionary(locale).back}
    </Link>
  );
}
export function PageBack({ locale, children }: { locale: Locale; children?: React.ReactNode }) {
  return useContext(WorkspaceBackContext) ? null : (
    <div className="mb-4">{children ?? <AppBack locale={locale} />}</div>
  );
}
function WorkspaceBack({ locale }: { locale: Locale }) {
  const path = usePathname();
  const params = useSearchParams();
  return showWorkspaceBack(path, params) ? (
    <div className="mx-auto w-full max-w-6xl px-5 pt-4 md:px-10">
      <AppBack locale={locale} />
    </div>
  ) : null;
}
export function WorkspaceNavigation({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceBackContext.Provider value={true}>
      <WorkspaceBack locale={locale} />
      {children}
    </WorkspaceBackContext.Provider>
  );
}
