import { RouteMeta } from '@analogjs/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';

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
  imports: [RouterOutlet, Footer, Header, Squircle],
  template: `
    <www-header />
    <div class="container" wwwSquircle="16 16 0 0">
      <router-outlet></router-outlet>
      <www-footer />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
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
