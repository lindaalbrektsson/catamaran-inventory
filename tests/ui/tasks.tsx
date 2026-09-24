import { TaskForm } from '@/components/task-form';
import { TaskList } from '@/components/task-list';
import { TaskProgress } from '@/components/task-progress';
import type { Task, TaskSubtask } from '@/lib/database.types';
import type { Locale } from '@/lib/i18n';
const actor = '40000000-0000-4000-8000-000000000001';
const task: Task = {
  id: '50000000-0000-4000-8000-000000000001',
  title: 'Check engine',
  description: '',
  type_code: 'MAINTENANCE',
  status: 'NEED_REVIEW',
  assignee_id: actor,
  due_date: '2026-09-30',
  remind_at: '2026-09-30T16:00:00Z',
  reminder_private: true,
  archived: false,
  version: 1,
  created_by: actor,
  updated_by: actor,
  created_at: '2026-09-29T18:00:00Z',
  updated_at: '2026-09-29T18:00:00Z',
  product_id: null,
  need_id: null,
  receipt_id: null,
  location_id: null,
  related_task_id: null,
};
const sub: TaskSubtask = {
  id: '60000000-0000-4000-8000-000000000001',
  task_id: task.id,
  title: 'Check oil',
  completed: false,
  completed_at: null,
  completed_by: null,
  created_at: task.created_at,
  updated_at: task.updated_at,
  created_by: actor,
  updated_by: actor,
};
const catalog = {
  reminderPeople: [
    { id: actor, display_name: 'Fixture operator', active: true },
    { id: '40000000-0000-4000-8000-000000000002', display_name: 'Fixture manager', active: true },
    { id: '40000000-0000-4000-8000-000000000003', display_name: 'Inactive person', active: false },
  ],
  people: [{ id: actor, display_name: 'Fixture operator', active: true }],
  types: [
    { code: 'TASK', name_en: 'Task', name_es: 'Tarea', active: true },
    { code: 'MAINTENANCE', name_en: 'Maintenance', name_es: 'Mantenimiento', active: true },
  ],
  products: [],
  needs: [],
  receipts: [],
  locations: [],
  tasks: [
    task,
    {
      ...task,
      id: '50000000-0000-4000-8000-000000000002',
      title: 'Call mechanic',
      due_date: '2026-09-29',
      assignee_id: null,
    },
  ],
};
export function TasksFixture({ locale, view }: { locale: Locale; view: string }) {
  if (view === 'task-form')
    return (
      <TaskForm
        locale={locale}
        catalog={catalog}
        reminderFor={
          new URLSearchParams(location.search).has('context')
            ? {
                id: task.id,
                title: task.title,
                assignee_id: new URLSearchParams(location.search).has('external')
                  ? null
                  : '40000000-0000-4000-8000-000000000002',
              }
            : undefined
        }
        actorId={actor}
        actorRole={new URLSearchParams(location.search).has('manager') ? 'MANAGER' : 'OWNER'}
        id="50000000-0000-4000-8000-000000000003"
        requestId={crypto.randomUUID()}
      />
    );
  if (view === 'task-progress')
    return (
      <>
        <TaskProgress task={task} locale={locale} requestId={crypto.randomUUID()} />
        <TaskProgress task={task} subtask={sub} locale={locale} requestId={crypto.randomUUID()} />
      </>
    );
  return (
    <TaskList
      {...catalog}
      tasks={
        new URLSearchParams(location.search).has('many')
          ? Array.from({ length: 12 }, (_, i) => ({
              ...task,
              id: String(i),
              title: 'Task ' + i,
              due_date: `2026-09-${String(28 + i).padStart(2, '0')}`,
              remind_at: null,
            }))
          : catalog.tasks
      }
      locale={locale}
      actorId={actor}
      now="2026-09-30T18:00:00Z"
      home={view === 'task-home'}
      canManage
    />
  );
}
