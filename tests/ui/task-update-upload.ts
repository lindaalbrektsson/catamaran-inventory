export async function addTaskUpdate(_: unknown, form: FormData) {
  if (!location.search.includes('voice-')) return { error: 'taskStale' as const };
  const voice = form.get('voice'),
    photo = form.get('photo');
  if (
    !String(form.get('body') ?? '').trim() &&
    !(voice instanceof File) &&
    !(photo instanceof File)
  )
    return { error: 'updateEmpty' as const };
  const data = {
    body: form.get('body'),
    duration: Number(form.get('duration')),
    hasPhoto: photo instanceof File,
    voice:
      voice instanceof File
        ? await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(voice);
          })
        : null,
  };
  localStorage.setItem('voice-fixture', JSON.stringify(data));
  return {};
}
