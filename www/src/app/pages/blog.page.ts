import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';
import { TheGravy } from '../components/TheGravy';

export const routeMeta: RouteMeta = {
  title: 'Home: Hashbrown Blog',
  meta: [
    {
      name: 'og:title',
      content: 'Home: Hashbrown Blog',
    },
    {
      name: 'og:description',
      content: 'Hashbrown Blog.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [RouterOutlet, Footer, Header, Squircle, TheGravy],
  template: `
    <www-header />
    <main class="container" wwwSquircle="16 16 0 0">
      <router-outlet></router-outlet>
    </main>
    <www-the-gravy id="dd18d015-795c-4c3b-a7c1-3c6f73caa7f0" />
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }

    .container {
      display: flex;
      flex-direction: column;
      background: #fff;
    }
  `,
})
export default class BlogPage {}
