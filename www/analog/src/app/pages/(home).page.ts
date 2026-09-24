import { RouteMeta } from '@analogjs/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Capabilities } from '../components/home/Capabilities';
import { ClosingCta } from '../components/home/ClosingCta';
import { HomeHero } from '../components/home/HomeHero';
import { HowItWorks } from '../components/home/HowItWorks';
import { LatestPosts } from '../components/home/LatestPosts';
import { RealApp } from '../components/home/RealApp';
import { ThreadplaneBanner } from '../components/home/ThreadplaneBanner';
import { WorksWith } from '../components/home/WorksWith';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown: AI chat and agents for React and Angular',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown: AI chat and agents for React and Angular',
    },
    {
      name: 'og:description',
      content:
        'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [
    Capabilities,
    ClosingCta,
    Footer,
    Header,
    HomeHero,
    HowItWorks,
    LatestPosts,
    RealApp,
    ThreadplaneBanner,
    WorksWith,
  ],
  template: `
    <www-header />
    <main>
      <div class="wrap"><www-home-hero /></div>
      <www-works-with />
      <div class="wrap">
        <www-how-it-works />
        <www-capabilities />
        <www-real-app />
        <www-threadplane-banner />
        <www-latest-posts />
        <www-closing-cta />
      </div>
    </main>
    <www-footer />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-repeat: repeat;
      background-attachment: fixed;
    }

    www-header ::ng-deep header {
      background: transparent;
    }

    .wrap {
      width: 100%;
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 16px;
    }

    @media screen and (min-width: 768px) {
      .wrap {
        padding: 0 32px;
      }
    }
  `,
})
export default class HomePage {}
