import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown AI Workshops',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown AI Workshops',
    },
    {
      name: 'og:description',
      content: 'Hashbrown AI Workshops.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [RouterOutlet, Header, Squircle, Footer],
  template: `
    <www-header />
    <main class="container" wwwSquircle="16 16 0 0">
      <router-outlet></router-outlet>
    </main>
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
export default class WorkshopsPage {}
