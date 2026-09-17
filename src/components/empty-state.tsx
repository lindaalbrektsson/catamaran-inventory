import { PackageOpen, ShoppingBag, ClipboardCheck, Wrench, FileText, Receipt } from 'lucide-react';
const icons = {
  inventory: PackageOpen,
  need: ShoppingBag,
  tasks: ClipboardCheck,
  maintenance: Wrench,
  documents: FileText,
  receipts: Receipt,
};
export function EmptyState({
  title,
  hint,
  domain = 'inventory',
}: {
  title: string;
  hint?: string;
  domain?: keyof typeof icons;
}) {
  const Icon = icons[domain];
  return (
    <div className="sea-lines-soft flex flex-col items-center rounded-xl px-4 py-7 text-center">
      <span className="domain-mark mb-3">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{hint}</p>}
    </div>
  );
}
