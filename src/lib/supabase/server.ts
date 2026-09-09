import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { config } from './config';
export async function supabase() {
  const jar=await cookies();
  const {url,key}=config();
  return createServerClient<Database>(url,key,{
    cookies:{
      getAll:()=>jar.getAll(),
      setAll:(values)=>{try { for(const {name,value,options} of values) jar.set(name,value,options); } catch { /* Server Components cannot set cookies; proxy refreshes the session. */ }},
    },
  });
}
