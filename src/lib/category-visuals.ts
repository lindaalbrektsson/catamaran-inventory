export const categoryIcons = [
  'package',
  'wrench',
  'waves',
  'glass',
  'lifebuoy',
  'spray',
  'food',
  'cog',
  'hammer',
  'box',
  'basket',
  'droplets',
] as const;
export const categoryAccents = [
  'neutral',
  'teal',
  'blue',
  'sand',
  'amber',
  'coral',
  'slate',
  'green',
] as const;
export type CategoryIconKey = (typeof categoryIcons)[number];
export type CategoryAccentKey = (typeof categoryAccents)[number];
export function categoryIcon(value?: string | null): CategoryIconKey {
  return categoryIcons.includes(value as CategoryIconKey) ? (value as CategoryIconKey) : 'package';
}
export function categoryAccent(value?: string | null): CategoryAccentKey {
  return categoryAccents.includes(value as CategoryAccentKey)
    ? (value as CategoryAccentKey)
    : 'neutral';
}
