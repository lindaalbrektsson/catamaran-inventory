import type { MetadataRoute } from 'next';
import { en } from '@/lib/i18n';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: en.appName,
    short_name: en.brand,
    description: en.signInHint,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    background_color: '#f6f8f7',
    theme_color: '#136b58',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
