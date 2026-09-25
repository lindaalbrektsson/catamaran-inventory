// Only history entries observed in this tab are trusted. Never use history.length
// or document.referrer: either can lead out of the app or back to authentication.
const key = '__catamaranBack';
type Marker = { url: string; previous: string | null };
function useful(url: string) {
  const path = new URL(url).pathname;
  return !/^\/(login|setup|pending|change-password|auth|api)(\/|$)/.test(path);
}
function marker(state: unknown, url: string): Marker | null {
  const value = state && typeof state === 'object' ? (state as Record<string, Marker>)[key] : null;
  if (!value || value.url !== url || typeof value.previous !== 'string') return null;
  try {
    return new URL(value.previous).origin === new URL(url).origin && useful(value.previous)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function canGoBackInApp() {
  return Boolean(marker(window.history.state, window.location.href));
}
export function trackAppHistory() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  const stateWith = (state: unknown, value: Marker) => ({
    ...(state && typeof state === 'object' ? state : {}),
    [key]: value,
  });
  // Keep the existing marker on reload; a direct visit has no trusted predecessor.
  const current = marker(history.state, window.location.href);
  replace.call(
    history,
    stateWith(history.state, current ?? { url: window.location.href, previous: null }),
    '',
  );
  const pushTracked: History['pushState'] = function (state, title, url) {
    const before = window.location.href;
    const target = new URL(url == null ? before : String(url), before).href;
    push.call(
      history,
      stateWith(state, { url: target, previous: useful(before) ? before : null }),
      title,
      url,
    );
  };
  const replaceTracked: History['replaceState'] = function (state, title, url) {
    const before = window.location.href;
    const previous = marker(history.state, before)?.previous ?? null;
    const target = new URL(url == null ? before : String(url), before).href;
    replace.call(history, stateWith(state, { url: target, previous }), title, url);
  };
  history.pushState = pushTracked;
  history.replaceState = replaceTracked;
  return () => {
    if (history.pushState === pushTracked) history.pushState = push;
    if (history.replaceState === replaceTracked) history.replaceState = replace;
  };
}
export function showWorkspaceBack(path: string, query: Pick<URLSearchParams, 'get'>) {
  return (
    !['/', '/needs', '/more', '/add'].includes(path) ||
    (path === '/add' && query.get('inventory') === '1')
  );
}
