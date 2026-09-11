import { it, expect } from 'vitest';
import {
  belizeDate,
  taskIndicators,
  reminderFromInput,
  reminderToInput,
} from '../src/lib/task-domain';
const task = {
  status: 'NEED_REVIEW' as const,
  archived: false,
  due_date: '2026-09-30',
  remind_at: null,
};
it('uses Belize calendar dates across UTC midnight', () =>
  expect(belizeDate(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30'));
it('shows today, tomorrow across month boundary and overdue', () => {
  const now = new Date('2026-09-30T18:00:00Z');
  expect(taskIndicators(task, now)).toEqual(['taskDueToday']);
  expect(taskIndicators({ ...task, due_date: '2026-10-01' }, now)).toEqual(['taskDueTomorrow']);
  expect(taskIndicators({ ...task, due_date: '2026-09-29' }, now)).toEqual(['taskOverdue']);
});
it('reminder becomes due only at its instant', () => {
  const t = { ...task, due_date: null, remind_at: '2026-09-30T18:00:00Z' };
  expect(taskIndicators(t, new Date('2026-09-30T17:59:00Z'))).toEqual([]);
  expect(taskIndicators(t, new Date(t.remind_at))).toEqual(['taskReminderDue']);
});
it('done and archived tasks do not generate reminders', () => {
  expect(taskIndicators({ ...task, status: 'DONE' })).toEqual([]);
  expect(taskIndicators({ ...task, archived: true })).toEqual([]);
});
it('converts Belize reminder inputs without using browser timezone', () => {
  expect(reminderFromInput('2026-10-01T08:30')).toBe('2026-10-01T14:30:00.000Z');
  expect(reminderToInput('2026-10-01T14:30:00Z')).toBe('2026-10-01T08:30');
  expect(() => reminderFromInput('invalid')).not.toThrow();
});
