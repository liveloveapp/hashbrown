import './global.css';
import { Fredoka, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';

const fredoka = Fredoka({
  subsets: ['latin'],
  preload: true,
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  preload: true,
  display: 'swap',
});

export const metadata = {
  title: 'Pilot Agent',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Pilot Agent</title>
        <base href="/" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/brand-mark.svg" />
      </head>
      <body className={`${fredoka.className} ${jetbrainsMono.className}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
