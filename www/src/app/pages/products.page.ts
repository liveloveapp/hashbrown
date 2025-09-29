import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Home: Hashbrown Products',
  meta: [
    {
      name: 'og:title',
      content: 'Home: Hashbrown Products',
    },
    {
      name: 'og:description',
      content: 'Hashbrown Products.',
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
    <main class="products">
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
export default class ProductsPage {}
