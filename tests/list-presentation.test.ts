import { expect, it } from 'vitest';
import { compactDate, relativeDue } from '@/lib/list-presentation';
it('compact dates use Belize for timestamps and preserve date-only days', () => {
  expect(compactDate('2026-09-17T01:00:00Z', 'en')).toContain('16');
  expect(compactDate('2026-09-17', 'es')).toContain('17');
});
it('relative due dates use Belize midnight, with localized overdue state', () => {
  const now = new Date('2026-09-18T02:00:00Z');
  expect(relativeDue('2026-09-17', now, 'en')).toBe('today');
  expect(relativeDue('2026-09-23', now, 'en')).toBe('in 6 days');
  expect(relativeDue('2026-09-14', now, 'en')).toBe('3 days overdue');
  expect(relativeDue('2026-09-14', now, 'es')).toBe('3 días de atraso');
});
