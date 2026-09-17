import {
  Package,
  Wrench,
  Waves,
  GlassWater,
  LifeBuoy,
  SprayCan,
  UtensilsCrossed,
  Cog,
  Hammer,
  Box,
  ShoppingBasket,
  Droplets,
} from 'lucide-react';
import { categoryIcon, categoryAccent } from '@/lib/category-visuals';
import type { Category } from '@/lib/database.types';
const icons = {
  package: Package,
  wrench: Wrench,
  waves: Waves,
  glass: GlassWater,
  lifebuoy: LifeBuoy,
  spray: SprayCan,
  food: UtensilsCrossed,
  cog: Cog,
  hammer: Hammer,
  box: Box,
  basket: ShoppingBasket,
  droplets: Droplets,
};
export function CategoryMark({
  category,
  small = false,
}: {
  category?: Pick<Category, 'icon_key' | 'accent_key'>;
  small?: boolean;
}) {
  const Icon = icons[categoryIcon(category?.icon_key)];
  return (
    <span
      aria-hidden="true"
      data-accent={categoryAccent(category?.accent_key)}
      className={`category-mark ${small ? 'category-mark-small' : ''}`}
    >
      <Icon className={small ? 'size-3.5' : 'size-5'} />
    </span>
  );
}
