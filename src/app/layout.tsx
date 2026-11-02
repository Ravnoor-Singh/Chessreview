import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import '@/styles/globals.css';
import PwaManager from '@/components/pwa/PwaManager';
import BackgroundLayer from '@/components/settings/BackgroundLayer';
import LocaleSync from '@/i18n/LocaleSync';

// Inter is self-hosted (variable font, wght 100–900) so the production build
// never fetches Google Fonts and works fully offline after `npm install`.
// Files: official Inter 4.001 via @fontsource-variable/inter (SIL OFL 1.1 —
// see src/assets/fonts/LICENSE and LICENSES.md).
const inter = localFont({
  src: [
    { path: '../assets/fonts/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    {
      path: '../assets/fonts/inter-latin-ext-wght-normal.woff2',
      weight: '100 900',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Chess Review — Stockfish Game Analysis',
  description:
    'Chess.com-style game review powered by Stockfish running locally in your browser. Accuracy, move classifications, engine lines and opening detection.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chess Review',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#262522',
};

// Set the theme before first paint to avoid a flash.
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('chess-review-settings')||'null');var t=(s&&s.state&&s.state.settings&&s.state.settings.theme)||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.variable}>
        {children}
        <PwaManager />
        <BackgroundLayer />
        <LocaleSync />
      </body>
    </html>
  );
}
