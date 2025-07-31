import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DocsMenu } from '../components/DocsMenu';
import { DocsSdkMenu } from '../components/DocsSdkMenu';
import { Products } from '../components/Products';
import { Footer } from '../components/Footer';
import { MarkdownPage } from '../components/MarkdownPage';
import { Header } from '../components/Header';

@Component({
  imports: [
    Header,
    DocsMenu,
    DocsSdkMenu,
    Products,
    Footer,
    MarkdownPage,
    RouterOutlet,
  ],
  template: `
    <www-header />
    <main class="docs">
      <www-docs-menu />
      <div>
        <www-docs-sdk-menu />
        <www-markdown-page>
          <router-outlet></router-outlet>
        </www-markdown-page>
      </div>
    </main>
    <www-products />
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .docs {
      flex: 1 auto;
      display: grid;
      grid-template-columns: auto;

      > www-docs-menu {
        display: none;
      }

      > div {
        overflow: hidden;
      }
    }

    @media screen and (min-width: 768px) {
      .docs {
        grid-template-columns: 192px auto;

        > www-docs-menu {
          display: flex;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .docs {
        grid-template-columns: 256px auto;
      }
    }

    @media screen and (min-width: 1281px) {
      .docs {
        grid-template-columns: 320px auto;
      }
    }
  `,
})
export default class DocsPage {}
