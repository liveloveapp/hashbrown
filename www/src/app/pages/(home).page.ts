import { Component, signal } from '@angular/core';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { LightsDemo } from '../components/LightsDemo';

@Component({
  imports: [Header, Footer, Hero, EnterpriseProducts, LightsDemo],
  template: `
    <www-header />
    <main>
      <www-hero />
      <section class="welcome">
        <h1>hashbrown</h1>
        <p>Let's see what AI can do<br />in your web app.</p>
      </section>
      <www-enterprise-products />
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

    .welcome {
      display: flex;
      justify-content: space-between;
      background: #fff;
      padding: 64px 32px;

      > h1 {
        font: 600 40px/48px sans-serif;
      }

      > p {
        font: 500 24px/32px sans-serif;
      }
    }
  `,
})
export default class HomePage {}
