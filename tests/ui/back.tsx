import ErrorPage from '../../src/app/error';
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AppHistory, WorkspaceNavigation } from '../../src/components/app-back';
import { PageHeader } from '../../src/components/page-header';
import { Navigation } from '../../src/components/navigation';
import '../../src/app/globals.css';
const locale = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';
function Fixture() {
  const path = useSyncExternalStore(
    (cb) => {
      window.addEventListener('popstate', cb);
      return () => window.removeEventListener('popstate', cb);
    },
    () => location.pathname,
  );
  function visit(url: string, replace = false) {
    history[replace ? 'replaceState' : 'pushState']({ next: 'preserved' }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  if (path === '/failure')
    return (
      <AppHistory>
        <ErrorPage error={new Error('fixture')} reset={() => location.reload()} />
      </AppHistory>
    );
  return (
    <AppHistory>
      <main className="workspace-content">
        <WorkspaceNavigation locale={locale}>
          <div className="page">
            <PageHeader title={path} back="/" locale={locale} />
            <button onClick={() => visit('/inventory?category=food')}>Inventory</button>
            <button onClick={() => visit('/inventory/item')}>Item</button>
            <button onClick={() => visit('/inventory?category=tools', true)}>Replace filter</button>
          </div>
        </WorkspaceNavigation>
      </main>
      <Navigation locale={locale} />
    </AppHistory>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
