import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Features } from '../components/home/Features';
import { Hero } from '../components/home/Hero';
import { Media } from '../components/home/Media';
import { OpenSource } from '../components/home/OpenSource';
import { Samples } from '../components/home/Samples';
import { TheGravy } from '../components/TheGravy';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown: The TypeScript Framework for Generative UI',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown: The TypeScript Framework for Generative UI',
    },
    {
      name: 'og:description',
      content:
        'TypeScript framework to use LLMs in your React or Angular app with client-side tools, real-time UI streaming, and safe LLM-generated code execution.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [
    Features,
    Footer,
    Header,
    Hero,
    Media,
    OpenSource,
    Samples,
    TheGravy,
  ],
  template: `
    <www-header />
    <main class="home">
      <www-hero />
      <www-samples />
      <www-open-source />
      <www-features />
      <www-media />
      <www-the-gravy />
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }

    www-header ::ng-deep header {
      background: transparent;
    }

    .home {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
    }
  `,
})
export default class HomePage {}
