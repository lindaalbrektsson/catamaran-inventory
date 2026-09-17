import { User, ContactRound } from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
export function AssigneeLabel({
  name,
  external = false,
  assigned = true,
  locale,
}: {
  name: string;
  external?: boolean;
  assigned?: boolean;
  locale: Locale;
}) {
  const t = dictionary(locale),
    Icon = external ? ContactRound : User;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Icon aria-hidden="true" className="size-4" />
      <span>{name}</span>
      {assigned && (
        <span className="text-xs text-muted-foreground">
          {external ? t.uxExternal : t.uxAppUser}
        </span>
      )}
    </span>
  );
}
