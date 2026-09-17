export async function quickAdd(_previous: unknown, form: FormData) {
  sessionStorage.setItem('quick-add-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'UNKNOWN' as const };
}
export async function saveNeed(_previous: unknown, form: FormData) {
  sessionStorage.setItem('need-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'UNKNOWN' as const };
}
export async function advanceNeed() {
  if (new URLSearchParams(location.search).has('fail')) return { error: 'STALE_NEED' as const };
  window.dispatchEvent(new Event('fixture-need-saved'));
  return {};
}
