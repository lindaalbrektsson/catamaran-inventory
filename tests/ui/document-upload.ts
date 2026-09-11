export async function uploadDocument(_previous: unknown, form: FormData) {
  const file = form.get('file');
  sessionStorage.setItem(
    'document-fixture',
    JSON.stringify({
      ...Object.fromEntries(form),
      selected_users: form.getAll('selected_users'),
      file: file instanceof File ? { name: file.name, size: file.size, type: file.type } : null,
    }),
  );
  return { error: 'docUploadIncomplete' as const };
}
