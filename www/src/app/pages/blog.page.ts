import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

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
  imports: [RouterOutlet, Footer, Header],
  template: `
    <www-header />
    <main>
      <router-outlet></router-outlet>
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  `,
})
export default class BlogPage {}
