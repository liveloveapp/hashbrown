import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ApiMenu } from '../components/ApiMenu';

@Component({
  imports: [RouterOutlet, Footer, Header, ApiMenu, EnterpriseProducts],
  template: `
    <www-header />
    <main class="api">
      <www-ref-menu />
      <div>
        <router-outlet></router-outlet>
      </div>
    </main>
    <www-enterprise-products />
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
      border-top: 1px solid rgba(61, 60, 58, 0.24);
      border-bottom: 1px solid rgba(61, 60, 58, 0.24);

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
