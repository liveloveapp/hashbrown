import { Component } from '@angular/core';
import { Adapters } from '../components/Adapters';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { GettingStarted } from '../components/GettingStarted';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { OpenSource } from '../components/OpenSource';
import { Providers } from '../components/Providers';
import { LdpTour } from '../components/ldp/LdpTour';
import { LdpTourMobile } from '../components/ldp/LdpTourMobile';

@Component({
  imports: [
    Adapters,
    EnterpriseProducts,
    Footer,
    GettingStarted,
    Header,
    Hero,
    OpenSource,
    Providers,
    LdpTour,
    LdpTourMobile,
  ],
  template: `
    <www-header />
    <main class="home">
      <www-hero />
      <www-providers />
      <www-ldp-tour />
      <www-ldp-tour-mobile />
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

    www-ldp-tour-mobile {
      display: none;
    }

    @media (width < 768px) {
      www-ldp-tour {
        display: none;
      }

      www-ldp-tour-mobile {
        display: block;
      }
    }
  `,
})
export default class HomePage {}
