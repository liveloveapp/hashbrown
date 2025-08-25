import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { TheGravy } from '../components/home/TheGravy';

@Component({
  imports: [RouterOutlet, Footer, Header, TheGravy],
  template: `
    <www-header />
    <main>
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
  `,
})
export default class BlogPage {}
