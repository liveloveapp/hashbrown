import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { GettingStarted } from '../components/home/GettingStarted';
import { Hero } from '../components/home/Hero';
import { OpenSource } from '../components/home/OpenSource';
import { TheGravy } from '../components/home/TheGravy';
import { LdpTour } from '../components/ldp/LdpTour';
import { LdpTourMobile } from '../components/ldp/LdpTourMobile';

@Component({
  imports: [
    Footer,
    GettingStarted,
    Header,
    Hero,
    LdpTour,
    LdpTourMobile,
    OpenSource,
    TheGravy,
  ],
  template: `
    <div class="texture">
      <www-header position="relative" />
      <www-hero />
    </div>
    <main class="home">
      <www-ldp-tour />
      <www-ldp-tour-mobile />
      <www-open-source />
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

    .texture {
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
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
