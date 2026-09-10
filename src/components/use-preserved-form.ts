'use client';
import { useEffect, useRef } from 'react';

// React form actions reset native selects after returning an error state.
// Cancel at the form itself, before React's delegated reset handling. Successful
// actions redirect; failures must preserve the exact payload for idempotent retry.
export function usePreservedForm() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    const preserve = (event: Event) => event.preventDefault();
    form?.addEventListener('reset', preserve);
    return () => form?.removeEventListener('reset', preserve);
  }, []);
  return ref;
}
