import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

@Component({
  imports: [RouterOutlet, Footer, Header],
  template: `
    <www-header position="fixed" />
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

    www-header ::ng-deep .spacer {
      display: none;
    }
  `,
})
export default class ProductsPage {}
