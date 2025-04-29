import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';

@Component({
  imports: [Header, Footer, Hero],
  template: `
    <www-header />
    <main>
      <www-hero />
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    main {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
    }
  `,
})
export default class HomePage {}
