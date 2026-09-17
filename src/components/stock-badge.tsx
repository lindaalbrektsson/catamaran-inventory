import { dictionary, type Locale } from '@/lib/i18n';
import { stockStatus } from '@/lib/stock-status';
import { StatusBadge, type StatusTone } from './status-badge';
export function StockBadge({
  quantity,
  minimum,
  locale,
}: {
  quantity: number;
  minimum: number | null;
  locale: Locale;
}) {
  const t = dictionary(locale),
    status = stockStatus(quantity, minimum);
  const labels = {
    low: t.lowStock,
    running: t.uxRunningLow,
    healthy: t.inStock,
    unconfigured: t.uxNoMinimum,
  };
  const tones: Record<typeof status, StatusTone> = {
    low: 'problem',
    running: 'attention',
    healthy: 'positive',
    unconfigured: 'neutral',
  };
  return <StatusBadge tone={tones[status]}>{labels[status]}</StatusBadge>;
}
