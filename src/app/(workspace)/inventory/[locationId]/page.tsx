import { getLocale,requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocation,getInventory } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { InventoryList } from '@/components/inventory-list';
export default async function LocationInventory({params,searchParams}:{params:Promise<{locationId:string}>;searchParams:Promise<{low?:string}>}) {
  await requireProfile();
  const {locationId}=await params,locale=await getLocale(),t=dictionary(locale);
  const [location,items,search]=await Promise.all([getLocation(locationId),getInventory(locationId),searchParams]);
  return <div className="page"><PageHeader title={location.name} description={t.inventoryIntro} back="/inventory" locale={locale}/><InventoryList items={items} locale={locale} initialLow={search.low==='1'}/></div>;
}
