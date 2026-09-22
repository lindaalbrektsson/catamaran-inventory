export async function quickAdd(_previous: unknown, form: FormData) {
  sessionStorage.setItem('quick-add-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'UNKNOWN' as const };
}
export async function saveNeed(_previous: unknown, form: FormData) {
  sessionStorage.setItem(
    'need-fixture',
    JSON.stringify({
      ...Object.fromEntries(form),
      photo:
        form.get('photo') instanceof File
          ? {
              name: (form.get('photo') as File).name,
              size: (form.get('photo') as File).size,
              type: (form.get('photo') as File).type,
            }
          : null,
    }),
  );
  return { error: 'UNKNOWN' as const };
}
export async function advanceNeed() {
  if (new URLSearchParams(location.search).has('fail')) return { error: 'STALE_NEED' as const };
  window.dispatchEvent(new Event('fixture-need-saved'));
  return {};
}

export const uploadNeed = saveNeed;
