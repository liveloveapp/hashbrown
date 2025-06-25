import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

@Component({
  imports: [RouterOutlet, Footer, Header],
  template: `
    <www-header />
    <main class="blog">
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

    .blog {
      border-bottom: 1px solid rgba(61, 60, 58, 0.24);
    }
  `,
})
export default class EnterprisePage {}
