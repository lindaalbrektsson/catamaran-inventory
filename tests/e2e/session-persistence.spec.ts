import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('persistent browser profile restores session after close and respects logout', async ({}, info) => {
  // Three full process launches need more time when the complete suite runs concurrently.
  test.setTimeout(60_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'catamaran-session-qa-'));
  const options = {
    headless: true,
    viewport: info.project.use.viewport,
    isMobile: info.project.name === 'mobile',
    userAgent: info.project.use.userAgent,
  };
  const open = async () => {
    const context = await chromium.launchPersistentContext(profile, options);
    const page = context.pages()[0];
    await page.goto('http://127.0.0.1:4174/session.html');
    await page.waitForFunction(() => 'sessionTest' in window);
    return { context, page };
  };
  const action = (page: Page, name: string) =>
    page.evaluate(async (key) => {
      const api = (window as unknown as { sessionTest: Record<string, () => Promise<unknown>> })
        .sessionTest;
      return api[key]();
    }, name);
  let run = await open();
  try {
    await action(run.page, 'login');
    expect(await action(run.page, 'signedIn')).toBe(true);
    const cookies = await run.context.cookies();
    expect(
      cookies.some(
        (cookie) =>
          cookie.name.includes('auth-token') && cookie.expires > Date.now() / 1000 + 86400,
      ),
    ).toBe(true);
    await run.context.close();
    run = await open();
    expect(await action(run.page, 'signedIn')).toBe(true);
    await action(run.page, 'refresh');
    await run.page.reload();
    await run.page.waitForFunction(() => 'sessionTest' in window);
    expect(await action(run.page, 'signedIn')).toBe(true);
    await action(run.page, 'logout');
    await run.context.close();
    run = await open();
    expect(await action(run.page, 'signedIn')).toBe(false);
  } finally {
    await run.context.close();
  }
});
