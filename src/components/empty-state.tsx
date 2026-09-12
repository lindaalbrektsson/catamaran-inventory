import { PackageOpen } from 'lucide-react';
import { Card, CardContent } from './ui/card';
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <PackageOpen className="mb-4 size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="section-title">{title}</h2>
        {hint && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
