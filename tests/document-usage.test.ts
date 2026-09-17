import { describe, it, expect } from 'vitest';
import { frequentDocuments } from '../src/lib/document-usage';
const docs = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  title: id,
  archived: false,
  current_file_id: id,
}));
describe('automatic document shortcuts', () => {
  it('ranks opens, breaks ties by recency and limits to three', () => {
    expect(
      frequentDocuments(
        docs,
        JSON.stringify({
          a: { count: 1, last: 1 },
          b: { count: 3, last: 1 },
          c: { count: 3, last: 2 },
          d: { count: 2, last: 3 },
        }),
      ).map((d) => d.id),
    ).toEqual(['c', 'b', 'd']);
  });
  it('never exposes revoked, archived or draft documents from stored usage', () => {
    expect(
      frequentDocuments(
        [
          { ...docs[0], archived: true },
          { ...docs[1], current_file_id: null },
        ],
        JSON.stringify({
          a: { count: 3, last: 1 },
          b: { count: 3, last: 1 },
          secret: { count: 99, last: 1 },
        }),
      ),
    ).toEqual([]);
  });
  it('ignores malformed storage and does not infer usage from legacy favorites', () => {
    for (const raw of ['bad', 'null', '[]', '{"a":{"count":-1,"last":2}}', '{}'])
      expect(frequentDocuments(docs, raw)).toEqual([]);
  });
});
import { afterEach, vi } from 'vitest';
import { recordDocumentOpen, documentUsageSnapshot } from '../src/lib/document-usage';
afterEach(() => vi.unstubAllGlobals());
it('records opens per UUID without sharing accounts and tolerates unavailable storage', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  recordDocumentOpen('user-a', 'a');
  recordDocumentOpen('user-a', 'a');
  expect(JSON.parse(documentUsageSnapshot('user-a')).a.count).toBe(2);
  expect(documentUsageSnapshot('user-b')).toBe('{}');
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  expect(() => recordDocumentOpen('user-a', 'a')).not.toThrow();
  expect(documentUsageSnapshot('user-a')).toBe('{}');
});
