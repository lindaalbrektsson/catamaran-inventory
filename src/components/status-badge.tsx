import type { ReactNode } from 'react';
export type StatusTone = 'neutral' | 'attention' | 'problem' | 'active' | 'positive';
const tones: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  attention: 'bg-warning-soft text-warning',
  problem: 'bg-red-50 text-red-800',
  active: 'bg-blue-50 text-blue-800',
  positive: 'bg-secondary text-primary',
};
export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
