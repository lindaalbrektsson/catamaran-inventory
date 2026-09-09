import 'server-only';
import { supabase } from './supabase/server';
import type { Balance,Category,Product } from './database.types';
import { notFound } from 'next/navigation';
import { z } from 'zod';
export type InventoryItem=Balance & {product:Product;category:Category};
export function validId(id:string) { if(!z.uuid().safeParse(id).success) notFound(); }
export async function getLocations() {
  const {data,error}=await (await supabase()).from('locations').select('*').eq('active',true).order('name');
  if(error) throw new Error('LOCATIONS_LOAD_FAILED');
  return data;
}
export async function getLocation(id:string) {
  validId(id);
  const {data,error}=await (await supabase()).from('locations').select('*').eq('id',id).eq('active',true).maybeSingle();
  if(error) throw new Error('LOCATION_LOAD_FAILED');
  if(!data) notFound();
  return data;
}
export async function getInventory(locationId:string):Promise<InventoryItem[]> {
  validId(locationId);
  const db=await supabase();
  const [balances,products,categories]=await Promise.all([
    db.from('inventory_balances').select('*').eq('location_id',locationId).order('product_id').limit(1000),
    db.from('products').select('*').eq('active',true).order('name').limit(1000),
    db.from('categories').select('*').order('name_en').limit(1000),
  ]);
  if(balances.error || products.error || categories.error) throw new Error('INVENTORY_LOAD_FAILED');
  const catalog=new Map(products.data.map(p=>[p.id,p]));
  const groups=new Map(categories.data.map(c=>[c.id,c]));
  return balances.data.flatMap(b=>{
    const product=catalog.get(b.product_id);
    const category=product?groups.get(product.category_id):undefined;
    return product && category ? [{...b,product,category}] : [];
  }).sort((a,b)=>a.product.name.localeCompare(b.product.name));
}
export async function getItem(locationId:string,productId:string) {
  validId(locationId);validId(productId);
  const db=await supabase();
  const [balance,product]=await Promise.all([
    db.from('inventory_balances').select('*').eq('location_id',locationId).eq('product_id',productId).maybeSingle(),
    db.from('products').select('*').eq('id',productId).eq('active',true).maybeSingle(),
  ]);
  if(balance.error || product.error) throw new Error('ITEM_LOAD_FAILED');
  if(!balance.data || !product.data) notFound();
  const category=await db.from('categories').select('*').eq('id',product.data.category_id).single();
  if(category.error) throw new Error('CATEGORY_LOAD_FAILED');
  return {...balance.data,product:product.data,category:category.data};
}
export async function getHistory(locationId:string,productId:string,page:number) {
  const db=await supabase();
  const {data,error,count}=await db.from('inventory_transactions').select('*',{count:'exact'})
    .eq('location_id',locationId).eq('product_id',productId)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*20,page*20-1);
  if(error) throw new Error('HISTORY_LOAD_FAILED');
  const ids=[...new Set(data.map(m=>m.performed_by_user_id))];
  const profiles=ids.length?await db.from('profiles').select('id,display_name').in('id',ids):{data:[],error:null};
  if(profiles.error) throw new Error('ACTORS_LOAD_FAILED');
  const names=new Map(profiles.data?.map(p=>[p.id,p.display_name]));
  return {movements:data.map(m=>({...m,actor:names.get(m.performed_by_user_id)??m.performed_by_user_id})),hasNext:(count??0)>page*20};
}
