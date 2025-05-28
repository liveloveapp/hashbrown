import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DocsHeader } from '../components/DocsHeader';
import { DocsMenu } from '../components/DocsMenu';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { MarkdownPage } from '../components/MarkdownPage';

@Component({
  imports: [
    DocsHeader,
    DocsMenu,
    EnterpriseProducts,
    Footer,
    MarkdownPage,
    RouterOutlet,
  ],
  template: `
    <www-docs-header />
    <main class="docs">
      <www-docs-menu />
      <www-markdown-page>
        <router-outlet></router-outlet>
      </www-markdown-page>
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

    .docs {
      flex: 1 auto;
      display: grid;
      grid-template-columns: auto;

      > www-docs-menu {
        display: none;
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
