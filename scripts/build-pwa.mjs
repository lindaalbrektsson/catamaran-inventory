// Node 24 reads the shared TypeScript dictionary without a build dependency.
// This script never reads environment files or operational data.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { en, es } from '../src/lib/i18n.ts';

const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
const sections = Object.entries({ en, es })
  .map(
    ([locale, t]) => `
<section data-language="${locale}" lang="${locale}">
  <p class="brand">${escape(t.appName)}</p>
  <h1>${escape(t.offlineTitle)}</h1>
  <p>${escape(t.offlineHint)}</p>
  <button data-retry>${escape(t.reconnect)}</button>
  <a href="/">${escape(t.openApp)}</a>
</section>`,
  )
  .join('');
const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#136b58"><meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/apple-icon.png"><link rel="icon" href="/icon.svg">
<title>${escape(en.offlineTitle)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f8f7;color:#173731;font:16px/1.6 system-ui,sans-serif;min-height:100dvh;display:grid;place-items:center;padding:calc(24px + env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
main{max-width:420px;width:100%;background:white;border:1px solid #dbe5df;border-radius:20px;padding:28px}img{width:64px;height:64px;border-radius:14px}.brand{color:#136b58;font-weight:600;font-size:14px}h1{font-size:30px;line-height:1.2;letter-spacing:-.03em}p{color:#60716a}button,a{font:inherit;min-height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:10px 16px;cursor:pointer}button{border:0;background:#136b58;color:white;width:100%;font-weight:600}a{color:#136b58;margin-top:8px}nav{display:flex;gap:8px;margin-top:24px}nav button{background:#e5f1eb;color:#136b58;font-size:14px}button[aria-pressed=true]{outline:2px solid #136b58}button:focus-visible,a:focus-visible{outline:3px solid #136b58;outline-offset:4px}[hidden]{display:none}
</style><script src="/offline.js" defer></script></head><body><main>
<img src="/icon-192.png" alt="" width="64" height="64">
${sections}<nav aria-label="${escape(en.language)} / ${escape(es.language)}">
<button data-set-language="en">${escape(en.en)}</button><button data-set-language="es">${escape(es.es)}</button>
</nav></main></body></html>`;
writeFileSync('public/offline.html', html);
const source = readFileSync('src/pwa/worker.js', 'utf8');
const hash = createHash('sha256').update(source).update(html);
for (const file of [
  'offline.js',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-icon.png',
  'favicon.png',
]) {
  hash.update(readFileSync(`public/${file}`));
}
writeFileSync('public/sw.js', source.replace('__VERSION__', hash.digest('hex').slice(0, 16)));
console.log('Generated public-only PWA assets.');
