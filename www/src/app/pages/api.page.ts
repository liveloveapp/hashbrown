import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiMenu } from '../components/ApiMenu';
import { Header } from '../components/Header';
import { Squircle } from '../components/Squircle';

@Component({
  imports: [RouterOutlet, Header, ApiMenu, Squircle],
  template: `
    <www-header />
    <main class="api">
      <www-api-menu />
      <div wwwSquircle="16 0 0 0">
        <router-outlet></router-outlet>
      </div>
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }

    .api {
      flex: 1 auto;
      display: grid;
      grid-template-columns: auto;
      overflow: hidden;

      > www-ref-menu {
        display: none;
      }

      > div {
        overflow-y: auto;
        overflow-x: hidden;
        background: #fff;
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
