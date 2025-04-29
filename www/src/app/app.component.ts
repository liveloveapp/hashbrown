import { isPlatformBrowser } from '@angular/common';
import { Component, inject, Injector, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Alert } from './components/Alert';
import { CodeExample } from './components/CodeExample';
import { MarkdownSymbolLink } from './components/MarkdownSymbolLink';

@Component({
  selector: 'www-root',
  imports: [RouterOutlet],
  template: ` <router-outlet></router-outlet> `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class AppComponent {
  injector = inject(Injector);
  platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.installCustomElements();
    }
  }

  async installCustomElements() {
    const { createCustomElement } = await import('@angular/elements');

    const alertElement = createCustomElement(Alert, {
      injector: this.injector,
    });
    customElements.define('www-alert', alertElement);

    const codeExampleElement = createCustomElement(CodeExample, {
      injector: this.injector,
    });
    customElements.define('www-code-example', codeExampleElement);

    const symbolLinkElement = createCustomElement(MarkdownSymbolLink, {
      injector: this.injector,
    });
    customElements.define('www-markdown-symbol-link', symbolLinkElement);
  }
}
