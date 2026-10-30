import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { SearchOverlay } from '../components/search/SearchOverlay';
import { Announcement } from '../components/site/Announcement';
import { EngagedTimeSignal } from '../components/site/EngagedTimeSignal';
import { PreAnalyticsBeacon } from '../components/site/PreAnalyticsBeacon';
import { RememberSdk } from '../components/site/RememberSdk';
import { ThreadplaneLinkSignal } from '../components/site/ThreadplaneLinkSignal';
import { WebsiteCollectorSignal } from '../components/site/WebsiteCollectorSignal';
import { ToastContainer } from '../components/toast/ToastContainer';
import {
  pageMetadata,
  SITE_TITLE_TEMPLATE,
  SITE_URL,
} from '../lib/site-metadata';
import './globals.css';

/** Hanken Grotesk and JetBrains Mono, self-hosted: the LiveLoveApp brand faces. */
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});
const code = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

/** Site-wide head tags, ported from `www/analog/index.html`. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...pageMetadata({
    title: 'Hashbrown: AI chat and agents for React and Angular',
    description:
      'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
  }),
  title: {
    default: 'Hashbrown: AI chat and agents for React and Angular',
    template: SITE_TITLE_TEMPLATE,
  },
  alternates: {
    types: { 'application/rss+xml': '/blog/rss.xml' },
  },
  twitter: {
    card: 'summary_large_image',
    site: '@liveloveappdev',
    creator: '@liveloveappdev',
  },
  icons: {
    icon: ['/image/logo/favicon.png', '/image/meta/favicon.svg'],
    // Analog's index.html pointed at /apple-touch-icon.png, which doesn't exist.
    apple: [{ url: '/image/meta/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

/**
 * Root layout: fonts, global styles, and the site-wide announcement, search
 * overlay and toast outlet (as the Angular `AppComponent` mounted them).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${code.variable}`}>
      <body>
        <PreAnalyticsBeacon />
        <RememberSdk />
        <EngagedTimeSignal />
        <ThreadplaneLinkSignal />
        <WebsiteCollectorSignal />
        {children}
        <Announcement />
        <SearchOverlay />
        <ToastContainer />
      </body>
    </html>
  );
}
