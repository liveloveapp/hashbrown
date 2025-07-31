import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Adapters } from '../components/home/Adapters';
import { GettingStarted } from '../components/home/GettingStarted';
import { Hero } from '../components/home/Hero';
import { OpenSource } from '../components/home/OpenSource';
import { TheGravy } from '../components/home/TheGravy';
import { LdpTour } from '../components/ldp/LdpTour';
import { LdpTourMobile } from '../components/ldp/LdpTourMobile';
import { Texture } from '../components/Texture';

@Component({
  imports: [
    Adapters,
    Footer,
    GettingStarted,
    Header,
    Hero,
    LdpTour,
    LdpTourMobile,
    OpenSource,
    Texture,
    TheGravy,
  ],
  template: `
    <www-texture>
      <www-header />
      <www-hero />
    </www-texture>
    <main class="home">
      <www-ldp-tour />
      <www-ldp-tour-mobile />
      <www-open-source />
      <www-adapters />
      <www-getting-started />
      <www-the-gravy />
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
