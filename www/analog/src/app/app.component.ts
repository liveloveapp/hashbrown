import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  HostListener,
  inject,
  Injector,
  PLATFORM_ID,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Alert } from './components/Alert';
import { Announcement } from './components/Announcement';
import { BackendCodeExample } from './components/BackendCodeExample';
import { CodeExample } from './components/CodeExample';
import { Carousel } from './components/Carousel';
import { Expander } from './components/Expander';
import { MarkdownSymbolLink } from './components/MarkdownSymbolLink';
import { NextStep } from './components/NextStep';
import { NextSteps } from './components/NextSteps';
import {
  SEARCH_OVERLAY_OPEN_EVENT,
  SearchOverlay,
} from './components/SearchOverlay';
import { Bolt } from './icons/Bolt';
import { Code } from './icons/Code';
import { Components } from './icons/Components';
import { DatabaseCog } from './icons/DatabaseCog';
import { Functions } from './icons/Functions';
import { Message } from './icons/Message';
import { Send } from './icons/Send';

@Component({
  selector: 'www-root',
  imports: [RouterOutlet, Announcement, SearchOverlay],
  template: `
    <router-outlet />
    <www-announcement />
    <www-search-overlay />
  `,
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
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  constructor() {
    if (this.isBrowser) {
      this.installCustomElements();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    if (!this.isBrowser) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest('input, textarea') || target.isContentEditable)
    ) {
      return;
    }

    const isKey = event.key === 'k' || event.key === 'K';
    const hasModifier = event.metaKey || event.ctrlKey;
    if (isKey && hasModifier) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_OPEN_EVENT));
    }
  }

  async installCustomElements() {
    const { createCustomElement } = await import('@angular/elements');

    const alertElement = createCustomElement(Alert, {
      injector: this.injector,
    });
    customElements.define('hb-alert', alertElement);

    const backendCodeExampleElement = createCustomElement(BackendCodeExample, {
      injector: this.injector,
    });
    customElements.define('hb-backend-code-example', backendCodeExampleElement);

    const boltElement = createCustomElement(Bolt, {
      injector: this.injector,
    });
    customElements.define('hb-bolt', boltElement);

    const codeElement = createCustomElement(Code, {
      injector: this.injector,
    });
    customElements.define('hb-code', codeElement);

    const codeExampleElement = createCustomElement(CodeExample, {
      injector: this.injector,
    });
    customElements.define('hb-code-example', codeExampleElement);

    const carouselElement = createCustomElement(Carousel, {
      injector: this.injector,
    });
    customElements.define('hb-carousel', carouselElement);

    const components = createCustomElement(Components, {
      injector: this.injector,
    });
    customElements.define('hb-components', components);

    const databaseCogElement = createCustomElement(DatabaseCog, {
      injector: this.injector,
    });
    customElements.define('hb-database-cog', databaseCogElement);

    const expanderElement = createCustomElement(Expander, {
      injector: this.injector,
    });
    customElements.define('hb-expander', expanderElement);

    const functionsElement = createCustomElement(Functions, {
      injector: this.injector,
    });
    customElements.define('hb-functions', functionsElement);

    const markdownSymbolLinkElement = createCustomElement(MarkdownSymbolLink, {
      injector: this.injector,
    });
    customElements.define('hb-markdown-symbol-link', markdownSymbolLinkElement);

    const messageElement = createCustomElement(Message, {
      injector: this.injector,
    });
    customElements.define('hb-message', messageElement);

    const nextStepsElement = createCustomElement(NextSteps, {
      injector: this.injector,
    });
    customElements.define('hb-next-steps', nextStepsElement);

    const nextStepElement = createCustomElement(NextStep, {
      injector: this.injector,
    });
    customElements.define('hb-next-step', nextStepElement);

    const sendElement = createCustomElement(Send, {
      injector: this.injector,
    });
    customElements.define('hb-send', sendElement);
  }
}
