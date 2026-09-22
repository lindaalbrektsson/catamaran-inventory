import { dictionary } from '@/lib/i18n';
import { StatusBadge } from './status-badge';
// The same short label is used in both locales.
export function TestBadge({ value }: { value?: boolean }) {
  return value ? <StatusBadge tone="attention">{dictionary('en').testBadge}</StatusBadge> : null;
}
