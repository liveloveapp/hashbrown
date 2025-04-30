import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { RefMenu } from '../components/RefMenu';

@Component({
  imports: [RouterOutlet, Footer, Header, RefMenu],
  template: `
    <www-header />
    <main>
      <www-ref-menu />
      <div>
        <router-outlet />
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

    main {
      flex: 1 auto;
      display: flex;

      > www-ref-menu {
        display: none;
      }

      > div {
        flex: 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
      }
    }

    @media screen and (min-width: 1024px) {
      main {
        > www-ref-menu {
          display: flex;
          width: 224px;
        }
      }
    }

    @media screen and (min-width: 1281px) {
      main {
        > www-ref-menu {
          width: 224px;
        }
      }
    }
  `,
})
export default class RefPage {}
