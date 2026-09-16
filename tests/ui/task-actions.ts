export async function saveTask(_previous: unknown, form: FormData) {
  sessionStorage.setItem('task-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'taskStale' as const };
}
export async function taskProgress(_previous: unknown, form: FormData) {
  sessionStorage.setItem('task-progress-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'taskStale' as const };
}

export async function snoozeReminder(_previous: unknown, form: FormData) {
  sessionStorage.setItem('snooze-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'taskStale' as const };
}
