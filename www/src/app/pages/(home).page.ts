import { Component } from '@angular/core';
import { Adapters } from '../components/Adapters';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { GettingStarted } from '../components/GettingStarted';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { LdpTour } from '../components/lpd/LdpTour';
import { OpenSource } from '../components/OpenSource';
import { Providers } from '../components/Providers';

@Component({
  imports: [
    Adapters,
    EnterpriseProducts,
    Footer,
    GettingStarted,
    Header,
    Hero,
    LdpTour,
    OpenSource,
    Providers,
  ],
  template: `
    <www-header />
    <main class="home">
      <www-hero />
      <www-providers />
      <www-lpd-tour />
      <www-open-source />
      <www-adapters />
      <www-getting-started />
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

    .home {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
    }
  `,
})
export default class HomePage {}
