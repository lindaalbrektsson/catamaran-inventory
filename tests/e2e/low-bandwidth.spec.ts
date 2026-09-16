import { test, expect } from '@playwright/test';
test('delayed update save provides pending feedback and retains the form', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=voice-update&slow-save');
  await page.getByRole('textbox', { name: 'Update', exact: true }).fill('Fixture only');
  const start = Date.now();
  await page.getByRole('button', { name: 'Add update', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  const feedbackMs = Date.now() - start;
  await expect(page.getByRole('status')).toHaveText('Saved');
  console.info(
    JSON.stringify({
      benchmark: 'fixture-update-save-1000ms-server',
      feedbackMs,
      totalMs: Date.now() - start,
    }),
  );
});
test('interrupted document upload keeps inputs and shows retry feedback', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=document-form&slow-save');
  await page.getByLabel('Title', { exact: true }).fill('Fixture document');
  await page.locator('input[name=file]').setInputFiles({
    name: 'fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nfixture'),
  });
  await page.getByRole('button', { name: 'Save document' }).click();
  await expect(page.getByRole('button', { name: 'Saving document…' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('file upload is incomplete');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fixture document');
  await expect(page.locator('input[name=file]')).not.toHaveValue('');
});
test('slow updates are optional, paginated, retryable and do not preload media', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  // Load the unbundled Vite fixture first; measure production cold assets separately.
  await page.goto('http://127.0.0.1:4174/?view=voice-update');
  await expect(page.getByRole('button', { name: 'Record voice note' })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 160 * 1024,
    uploadThroughput: 64 * 1024,
  });
  let reads = 0,
    media = 0;
  page.on('request', (r) => {
    if (r.url().includes('/task-update-file/')) media++;
  });
  await page.route('**/api/task-updates?*', async (route) => {
    reads++;
    await new Promise((r) => setTimeout(r, 700));
    if (reads === 1) return route.fulfill({ status: 503, json: { error: 'fixture' } });
    await route.fulfill({
      json: {
        rows: [
          {
            id: 'fixture-' + reads,
            body: 'Reviewed update',
            created_by: 'fixture',
            created_at: '2026-09-16T12:00:00Z',
            photo: {},
            voice: { duration: 3 },
          },
        ],
        more: reads === 2,
      },
    });
  });
  const start = Date.now();
  expect(reads).toBe(0);
  expect(media).toBe(0);
  await page.getByText('Updates', { exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Loading…');
  await page.getByRole('textbox', { name: 'Update', exact: true }).fill('Still responsive');
  await expect(page.getByRole('alert')).toContainText('Could not load updates');
  console.info(
    JSON.stringify({ benchmark: 'constrained-history-error-feedback', ms: Date.now() - start }),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Reviewed update')).toBeVisible();
  await expect(page.locator('audio')).toHaveAttribute('preload', 'none');
  expect(media).toBe(0);
  await page.getByRole('button', { name: 'Older updates' }).click();
  await expect(page.getByText('Reviewed update')).toHaveCount(2);
  expect(reads).toBe(3);
  await expect(page.getByRole('button', { name: 'Older updates' })).toHaveCount(0);
  await page.route('**/task-update-file/**', (route) => route.abort());
  await page
    .locator('audio')
    .first()
    .evaluate((element) => {
      void (element as HTMLAudioElement).play().catch(() => {});
    });
  await expect(page.getByRole('alert')).toContainText('cannot play');
  await page
    .getByRole('textbox', { name: 'Update', exact: true })
    .fill('Usable after media failure');
  await expect(page.getByRole('textbox', { name: 'Update', exact: true })).toHaveValue(
    'Usable after media failure',
  );
});
