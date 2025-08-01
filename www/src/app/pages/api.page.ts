import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiMenu } from '../components/ApiMenu';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { TheGravy } from '../components/home/TheGravy';

@Component({
  imports: [RouterOutlet, Footer, Header, ApiMenu, TheGravy],
  template: `
    <www-header position="fixed" />
    <main class="api">
      <www-ref-menu />
      <div>
        <router-outlet></router-outlet>
      </div>
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

    .api {
      flex: 1 auto;
      display: grid;
      grid-template-columns: auto;

      > www-ref-menu {
        display: none;
      }

      > div {
        flex: 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
      }
    }

    @media screen and (min-width: 768px) {
      .api {
        grid-template-columns: 192px auto;

        > www-ref-menu {
          display: flex;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .api {
        grid-template-columns: 256px auto;
      }
    }

    @media screen and (min-width: 1281px) {
      .api {
        grid-template-columns: 320px auto;
      }
    }
  `,
})
export default class ApiPage {}
