import type { Metadata } from 'next';
import { Capabilities } from '../components/home/Capabilities';
import { ClosingCta } from '../components/home/ClosingCta';
import { HomeHero } from '../components/home/HomeHero';
import { HomeToasts } from '../components/home/HomeToasts';
import { HowItWorks } from '../components/home/HowItWorks';
import { LatestPosts } from '../components/home/LatestPosts';
import { RealApp } from '../components/home/RealApp';
import { ThreadplaneBanner } from '../components/home/ThreadplaneBanner';
import { WorksWith } from '../components/home/WorksWith';
import { Footer } from '../components/site/Footer';
import { Header } from '../components/site/Header';
import { getHomeCodeHtml } from '../lib/home-code';
import { pageMetadata } from '../lib/site-metadata';
import styles from '../components/home/HomePage.module.css';

/** Metadata from the Analog `(home).page.ts` `routeMeta`. */
export const metadata: Metadata = pageMetadata({
  title: 'Hashbrown: AI chat and agents for React and Angular',
  description:
    'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
});

/**
 * The homepage (port of `(home).page.ts`). Code samples are highlighted here
 * at build time for both frameworks. The header and footer links follow the
 * framework toggle, as the Angular `ConfigService` made them do.
 */
export default async function HomePage() {
  const code = await getHomeCodeHtml();

  return (
    <div className={styles.page}>
      <Header />
      <main>
        <div className={styles.wrap}>
          <HomeHero codeHtml={code.hero} />
        </div>
        <WorksWith />
        <div className={styles.wrap}>
          <HowItWorks stepsHtml={code.steps} />
          <Capabilities />
          <RealApp />
          <ThreadplaneBanner />
          <LatestPosts />
          <ClosingCta />
        </div>
      </main>
      <Footer />
      <HomeToasts />
    </div>
  );
}
