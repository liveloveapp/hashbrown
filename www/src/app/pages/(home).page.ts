import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/home/Hero';
import { Media } from '../components/home/Media';
import { OpenSource } from '../components/home/OpenSource';
import { Samples } from '../components/home/Samples';
import { TheGravy } from '../components/home/TheGravy';
import { TheVisual } from '../components/home/TheVisual';
import { Features } from '../components/home/Features';
import { RouteMeta } from '@analogjs/router';

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
        'Hashbrown is a TypeScript framework for building generative user interfaces that converse with users, dynamically reorganize, and even code themselves.',
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
    TheVisual,
  ],
  template: `
    <www-header />
    <main class="home">
      <www-hero />
      <www-samples />
      <www-open-source />
      <www-features />
      <www-the-visual />
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
