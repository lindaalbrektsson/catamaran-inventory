// Test-only Next.js adapter. Production always uses next/link.
import type { ComponentProps } from 'react';
export default function Link(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
