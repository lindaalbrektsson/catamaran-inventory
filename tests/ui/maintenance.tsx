import { AddHub } from '@/components/add-hub';
import {
  MaintenanceCreate,
  MaintenanceList,
  MaintenanceWork,
  MaintenanceUpdateForm,
} from '@/components/maintenance';
import { ReminderSnooze } from '@/components/reminder-snooze';
import type { MaintenanceCatalog } from '@/lib/maintenance';
import type { Locale } from '@/lib/i18n';
const actor = '40000000-0000-4000-8000-000000000001',
  id = '50000000-0000-4000-8000-000000000001';
const task = {
  id,
  title: 'Check oil',
  description: '',
  type_code: 'MAINTENANCE',
  status: 'NEED_REVIEW' as const,
  assignee_id: null,
  due_date: null,
  remind_at: null,
  reminder_private: false,
  archived: false,
  version: 1,
  created_by: actor,
  updated_by: actor,
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:00:00Z',
  product_id: null,
  need_id: null,
  receipt_id: null,
  location_id: null,
  related_task_id: null,
};
const occurrence = {
  id,
  task_id: id,
  plan_date: '2026-09-16',
  status: 'IN_PROGRESS' as const,
  assignee_id: null,
  manual_assignee: 'Charlie',
  remaining: 'Install hinge',
  version: 1,
  created_by: actor,
  updated_by: actor,
  created_at: task.created_at,
  updated_at: task.created_at,
  completed_by: null,
  completed_at: null,
};
const catalog: MaintenanceCatalog = {
  today: '2026-09-16',
  clock: '12:00:00',
  people: [{ id: actor, display_name: 'Fixture operator' }],
  occurrences: [],
  tasks: [task, { ...task, id: '50000000-0000-4000-8000-000000000002', title: 'Repair hatch' }],
  rules: [
    {
      task_id: id,
      recurrence: 'DAILY',
      custom_days: null,
      next_due: '2026-09-15',
      last_completed: null,
      due_time: '07:00:00',
      weekday: null,
      monthday: null,
    },
    {
      task_id: '50000000-0000-4000-8000-000000000002',
      recurrence: 'NONE',
      custom_days: null,
      next_due: null,
      last_completed: null,
      due_time: null,
      weekday: null,
      monthday: null,
    },
  ],
};
export function MaintenanceFixture({ view, locale }: { view: string; locale: Locale }) {
  if (view === 'maintenance-add') return <AddHub locale={locale} />;
  if (view === 'maintenance-create')
    return <MaintenanceCreate locale={locale} today={catalog.today} />;
  if (view === 'maintenance-plan')
    return <MaintenanceList catalog={catalog} locale={locale} planner />;
  if (view === 'maintenance-work')
    return <MaintenanceWork occurrence={occurrence} people={catalog.people} locale={locale} />;
  if (view === 'maintenance-update')
    return <MaintenanceUpdateForm occurrence={id} locale={locale} />;
  if (view === 'maintenance-snooze')
    return <ReminderSnooze actorId={actor} id={id} version={1} locale={locale} />;
  return <MaintenanceList catalog={{ ...catalog, occurrences: [occurrence] }} locale={locale} />;
}
