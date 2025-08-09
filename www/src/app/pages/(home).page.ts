import { Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { GettingStarted } from '../components/home/GettingStarted';
import { Hero } from '../components/home/Hero';
import { OpenSource } from '../components/home/OpenSource';
import { TheGravy } from '../components/home/TheGravy';
import { Samples } from '../components/home/Samples';

@Component({
  imports: [
    Footer,
    GettingStarted,
    Header,
    Hero,
    OpenSource,
    Samples,
    TheGravy,
  ],
  template: `
    <www-header />
    <main class="home">
      <www-hero />
      <www-samples />
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
      min-height: 100%;
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
  `,
})
export default class HomePage {}
