import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DocsMenu } from '../components/DocsMenu';
import { Header } from '../components/Header';
import { MarkdownPage } from '../components/MarkdownPage';
import { Squircle } from '../components/Squircle';

@Component({
  imports: [DocsMenu, Header, MarkdownPage, RouterOutlet, Squircle],
  template: `
    <www-header />
    <main class="docs">
      <www-docs-menu />
      <div wwwSquircle="16 0 0 0">
        <www-markdown-page>
          <router-outlet></router-outlet>
        </www-markdown-page>
      </div>
    </main>
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
      background: var(--vanilla-ivory, #faf9f0);

      > www-docs-menu {
        display: none;
      }

      > div {
        overflow: hidden;
        background: #fff;
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
  `,
})
export default class DocsPage {}
