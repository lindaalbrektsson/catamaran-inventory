'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { config, isConfigured } from '@/lib/supabase/config';
import type { Database } from '@/lib/database.types';

/** Keep the cookie-backed SDK singleton alive across page navigation and PWA resumes. */
export function SessionRefresh() {
  useEffect(() => {
    if (!isConfigured()) return;
    const { url, key } = config();
    // The SDK handles refresh rotation, locking, foreground recovery and persistent cookies.
    // Never sign out on unmount, backgrounding or transient network failures.
    createBrowserClient<Database>(url, key);
  }, []);
  return null;
}
