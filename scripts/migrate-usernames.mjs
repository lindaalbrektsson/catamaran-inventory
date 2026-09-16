import { createClient } from '@supabase/supabase-js';
import { migrateAliases } from './username-rollout.mjs';
const entries = [
 {id:'3ea06162-de4a-4b3e-a121-304137e7098d',username:'linda'},
 {id:'32a47dc1-ff66-48e0-9d39-cf5be120556f',username:'test.manager'},
];
try {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if (url !== 'https://shxbhjpjbaknwukqqqoh.supabase.co') throw new Error('WRONG_PROJECT');
 const key=process.env.SUPABASE_AUTH_ADMIN_KEY;
 if (!key) throw new Error('ADMIN_CONFIGURATION_REQUIRED');
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const results=await migrateAliases(admin,entries,entries[0].id,process.env.AUTH_INTERNAL_EMAIL_DOMAIN ?? '',process.argv.includes('--apply'));
 console.log(JSON.stringify(results,null,2));
} catch { console.error('Username rollout stopped. Check project/configuration and migration prerequisites. No credentials were logged.'); process.exitCode=1; }
