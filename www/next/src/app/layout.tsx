import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SearchOverlay } from '../components/search/SearchOverlay';
import { Announcement } from '../components/site/Announcement';
import { RememberSdk } from '../components/site/RememberSdk';
import { ToastContainer } from '../components/toast/ToastContainer';
import { pageMetadata } from '../lib/site-metadata';
import './globals.css';

/** Site-wide head tags, ported from `www/analog/index.html`. */
export const metadata: Metadata = {
  metadataBase: new URL('https://hashbrown.dev'),
  ...pageMetadata({
    title: 'Hashbrown: AI chat and agents for React and Angular',
    description:
      'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
  }),
  twitter: {
    card: 'summary_large_image',
    site: '@liveloveappdev',
    creator: '@liveloveappdev',
    images: ['https://hashbrown.dev/image/meta/twitter-card.png'],
  },
  icons: {
    icon: ['/image/logo/favicon.png', '/image/meta/favicon.svg'],
    // Analog's index.html pointed at /apple-touch-icon.png, which doesn't exist.
    apple: [{ url: '/image/meta/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#FDE4BA',
};

/**
 * Root layout: fonts, global styles, and the site-wide announcement, search
 * overlay and toast outlet (as the Angular `AppComponent` mounted them).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.fonts.net/kit/b29934de-5479-4373-aeff-bf0861be360f/b29934de-5479-4373-aeff-bf0861be360f_enhanced.css"
        />
      </head>
      <body>
        <RememberSdk />
        {children}
        <Announcement />
        <SearchOverlay />
        <ToastContainer />
      </body>
    </html>
  );
}
