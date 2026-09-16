// Test-only Next.js adapter. Production always uses next/link.
import type { ComponentProps } from 'react';
export default function Link({
  prefetch,
  ...props
}: ComponentProps<'a'> & { prefetch?: boolean | null }) {
  void prefetch;
  return <a {...props} />;
}
