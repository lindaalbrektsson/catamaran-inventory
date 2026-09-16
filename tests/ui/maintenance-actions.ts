async function capture(_previous: unknown, form: FormData) {
  sessionStorage.setItem(
    'maintenance-fixture',
    JSON.stringify({ ...Object.fromEntries(form), tasks: form.getAll('task') }),
  );
  return { error: 'taskStale' as const };
}
export const createMaintenance = capture,
  planMaintenance = capture,
  updateMaintenance = capture,
  addMaintenanceUpdate = capture;
