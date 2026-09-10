import { defineConfig } from 'vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
const root = process.cwd();
export default defineConfig({
  root: path.join(root, 'tests/ui'),
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: 'next/image', replacement: path.join(root, 'tests/ui/image.tsx') },
      { find: '@/lib/spending-actions', replacement: path.join(root, 'tests/ui/spending-actions.ts') },
      { find: 'next/link', replacement: path.join(root, 'tests/ui/link.tsx') },
      { find: 'next/navigation', replacement: path.join(root, 'tests/ui/navigation.ts') },
      { find: '@/lib/actions', replacement: path.join(root, 'tests/ui/actions.ts') },
      { find: '@', replacement: path.join(root, 'src') },
    ],
  },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
