import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { TheGravy } from '../components/home/TheGravy';

@Component({
  imports: [RouterOutlet, Footer, Header, TheGravy],
  template: `
    <www-header position="fixed" />
    <main class="blog">
      <router-outlet></router-outlet>
    </main>
    <www-the-gravy />
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
export default class BlogPage {}
