import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hashbrown',
  description: 'Hashbrown: The TypeScript Framework for Generative UI',
};

/** Root layout: fonts and global styles shared by every route. */
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
      <body>{children}</body>
    </html>
  );
}
