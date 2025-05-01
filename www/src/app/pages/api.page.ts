import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ApiMenu } from '../components/ApiMenu';

@Component({
  imports: [RouterOutlet, Footer, Header, ApiMenu],
  template: `
    <www-header />
    <main>
      <www-ref-menu />
      <div>
        <router-outlet></router-outlet>
      </div>
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    www-header {
      border-bottom: 1px solid rgba(47, 47, 43, 0.24);
    }

    main {
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
      main {
        grid-template-columns: 192px auto;

        > www-ref-menu {
          display: flex;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      main {
        grid-template-columns: 256px auto;
      }
    }

    @media screen and (min-width: 1281px) {
      main {
        grid-template-columns: 320px auto;
      }
    }
  `,
})
export default class ApiPage {}
