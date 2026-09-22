import 'server-only';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

type Functions = Database['public']['Functions'];
// Normal calls remain unchanged. The database wrapper accepts only creation RPCs.
export async function creationRpc<K extends keyof Functions>(
  db: SupabaseClient<Database>,
  isTest: boolean,
  name: K,
  args: Functions[K]['Args'],
): Promise<{ data: Functions[K]['Returns'] | null; error: PostgrestError | null }> {
  const result = isTest
    ? await db.rpc('create_test_record', { p_function: name, p_args: args as Json })
    : await (
        db.rpc as unknown as (
          name: K,
          args: Functions[K]['Args'],
        ) => Promise<{
          data: Functions[K]['Returns'] | null;
          error: PostgrestError | null;
        }>
      )(name, args);
  return result as { data: Functions[K]['Returns'] | null; error: PostgrestError | null };
}
