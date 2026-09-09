import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { config as supabaseConfig,isConfigured } from '@/lib/supabase/config';
import type { Database } from '@/lib/database.types';
export async function proxy(request: NextRequest) {
  if (!isConfigured()) return NextResponse.next();
  let response=NextResponse.next({request});
  const {url,key}=supabaseConfig();
  const client=createServerClient<Database>(url,key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:(values)=>{
      for(const {name,value} of values) request.cookies.set(name,value);
      response=NextResponse.next({request});
      for(const {name,value,options} of values) response.cookies.set(name,value,options);
    },
  }});
  await client.auth.getClaims();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)']};
