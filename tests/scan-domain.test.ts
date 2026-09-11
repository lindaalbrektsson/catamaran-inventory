import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractionSchema,
  scanMatch,
  initialReview,
  scanReviewSchema,
} from '../src/lib/scan-domain';
import type { ItemCatalog } from '../src/lib/item-domain';
vi.mock('server-only', () => ({}));
const catalog = {
  products: [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Water', active: true },
    { id: '10000000-0000-4000-8000-000000000002', name: 'Water bottles', active: true },
  ],
  categories: [],
  locations: [],
} as unknown as ItemCatalog;
const result = {
  supplier: null,
  date: null,
  total: null,
  currency: null,
  items: [{ name: 'Water', quantity: 24, check: false }],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('case-insensitive exact matches preserve the real product ID', () => {
  expect(scanMatch(catalog, 'WATER').product).toBe(catalog.products[0].id);
});
it('partial and misspelled candidates remain uncertain, never silently merged', () => {
  expect(scanMatch(catalog, 'Wat').status).toBe('UNCERTAIN');
  expect(scanMatch(catalog, 'Waterr').status).toBe('UNCERTAIN');
  expect(scanMatch(catalog, 'Wat').product).toBe('');
});
it('new items remain unmatched', () => {
  expect(scanMatch(catalog, 'New anchor').status).toBe('NEW');
});
it('review defaults every action to Ignore and preserves original quantity', () => {
  const review = initialReview(result, catalog);
  expect(review.rows[0].action).toBe('IGNORE');
  expect(review.rows[0].quantity).toBe(24);
});
it('invalid quantity can be displayed but requires correction or removal before approval', () => {
  const bad = extractionSchema.parse({
    ...result,
    items: [{ name: 'Water', quantity: -4, check: true }],
  });
  const review = initialReview(bad, catalog);
  review.rows[0].action = 'NEED';
  expect(scanReviewSchema.safeParse(review).success).toBe(false);
  review.rows[0].quantity = 4;
  expect(scanReviewSchema.safeParse(review).success).toBe(true);
});
describe('isolated provider contract, not OCR quality verification', () => {
  for (const fixture of [
    {
      name: 'printed',
      items: [
        { name: 'water', quantity: 24, check: false },
        { name: 'rum', quantity: 2, check: false },
      ],
    },
    {
      name: 'handwritten uncertain',
      items: [{ name: 'snorkel gear size 5', quantity: 3, check: true }],
    },
  ]) {
    it(fixture.name, async () => {
      vi.stubEnv('SMART_SCAN_ENABLED', 'true');
      vi.stubEnv('OPENAI_API_KEY', 'unit-test-only');
      vi.stubEnv('SMART_SCAN_MODEL', 'test-model');
      const payload = { ...result, items: fixture.items };
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(payload) }] }],
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { extractScan } = await import('../src/lib/scan-ai');
      expect((await extractScan(Buffer.from('isolated-image'), 'NOTE')).result).toEqual(payload);
      const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(sent.store).toBe(false);
      expect(sent.input[0].content).toHaveLength(2);
      expect(JSON.stringify(sent)).not.toContain('Water bottles');
      expect(sent.tools).toBeUndefined();
    });
  }
  it('refusals fail safely without operational side effects', async () => {
    vi.stubEnv('SMART_SCAN_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'unit-test-only');
    vi.stubEnv('SMART_SCAN_MODEL', 'test-model');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }),
      ),
    );
    const { extractScan } = await import('../src/lib/scan-ai');
    await expect(extractScan(Buffer.from('image'), 'NOTE')).rejects.toThrow('SCAN_FAILED');
  });
});
