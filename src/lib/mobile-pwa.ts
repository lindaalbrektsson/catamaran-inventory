export function mobilePlatform(ua: string, touch: number): 'ios' | 'android' | null {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'ios';
  return null;
}
export function isMobilePwa() {
  return Boolean(
    mobilePlatform(navigator.userAgent, navigator.maxTouchPoints) &&
    (matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone),
  );
}
