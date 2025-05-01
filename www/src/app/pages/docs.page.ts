import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { map, tap } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DocsHeader } from '../components/DocsHeader';
import { Footer } from '../components/Footer';
import { MarkdownPage } from '../components/MarkdownPage';
import { DocsMenu } from '../components/DocsMenu';
import { ConfigService, SdkConfig } from '../services/ConfigService';

@Component({
  imports: [RouterOutlet, Footer, DocsHeader, DocsMenu, MarkdownPage],
  template: `
    <www-docs-header />
    <main>
      <www-docs-menu />
      <www-markdown-page>
        <router-outlet></router-outlet>
      </www-markdown-page>
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
      display: grid;
      grid-template-columns: auto;

      > www-docs-menu {
        display: none;
      }
    }

    @media screen and (min-width: 768px) {
      main {
        grid-template-columns: 192px auto;

        > www-docs-menu {
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
export default class DocsPage {
  configService = inject(ConfigService);
  router = inject(Router);
  sdk = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.url.match(/\/docs\/([^/]+)\//)),
      filter((matches): matches is RegExpMatchArray => matches !== null),
      filter((matches) => matches.length > 1),
      map((matches) => matches[1]),
      tap((sdk) => {
        this.configService.set({ sdk: sdk as SdkConfig['sdk'] });
      }),
    ),
  );
}
