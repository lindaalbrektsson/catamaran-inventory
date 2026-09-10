// Offline language is a device preference only; no accounts or operational data.
(() => {
  let locale = navigator.language.startsWith('es') ? 'es' : 'en';
  try {
    const saved = localStorage.getItem('coral-pwa-language');
    if (saved === 'en' || saved === 'es') locale = saved;
  } catch {
    /* Optional storage. */
  }
  function show(language) {
    document.documentElement.lang = language;
    for (const section of document.querySelectorAll('[data-language]')) {
      section.hidden = section.dataset.language !== language;
    }
    for (const button of document.querySelectorAll('[data-set-language]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setLanguage === language));
    }
    const heading = document.querySelector(`[data-language="${language}"] h1`);
    if (heading) document.title = heading.textContent;
  }
  for (const button of document.querySelectorAll('[data-set-language]')) {
    button.addEventListener('click', () => {
      show(button.dataset.setLanguage);
      try {
        localStorage.setItem('coral-pwa-language', button.dataset.setLanguage);
      } catch {
        /* Optional. */
      }
    });
  }
  for (const button of document.querySelectorAll('[data-retry]')) {
    button.addEventListener('click', () => {
      // This public fallback deliberately runs without the Next.js runtime.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (location.pathname === '/offline.html') location.assign('/');
      else location.reload();
    });
  }
  show(locale);
})();
