import './session';
import { createRoot } from 'react-dom/client';
import { PwaProvider } from '@/components/pwa-support';
const locale = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';
createRoot(document.getElementById('root')!).render(
  <PwaProvider locale={locale} version="old-test-version">
    <form>
      <label>
        Draft
        <input name="draft" />
      </label>
    </form>
  </PwaProvider>,
);
