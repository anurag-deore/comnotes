import type { MetadataRoute } from 'next';
import { APP_COLORS } from '@/lib/pwa';

// Installable app (CNOTE-20), served at /manifest.webmanifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ComNotes',
    short_name: 'ComNotes',
    description: 'A secure note-taking application',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: APP_COLORS.background,
    theme_color: APP_COLORS.light,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
