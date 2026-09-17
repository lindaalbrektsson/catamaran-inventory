import { expect, it } from 'vitest';
import {
  categoryIcon,
  categoryAccent,
  categoryIcons,
  categoryAccents,
} from '../src/lib/category-visuals';
it('legacy and unrecognized metadata use safe fallbacks', () => {
  for (const value of [undefined, null, '', '<script>', 'Maintenance']) {
    expect(categoryIcon(value)).toBe('package');
    expect(categoryAccent(value)).toBe('neutral');
  }
});
it('all curated keys round-trip without category-name coupling', () => {
  for (const value of categoryIcons) expect(categoryIcon(value)).toBe(value);
  for (const value of categoryAccents) expect(categoryAccent(value)).toBe(value);
});
