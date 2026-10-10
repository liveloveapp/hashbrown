import { SOURCE_URLS, startAtcFeed } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { AirspaceMapComponent } from './airspace-map';
import { Assistant } from './assistant';
import { FeedBadgeComponent } from './feed-badge';
import { ATC_STORE } from './store';

/** The page: live map, top bar and the overlay chat. */
@Component({
  selector: 'atc-root',
  imports: [AirspaceMapComponent, Assistant, FeedBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="atc-shell">
      <atc-airspace-map />
      <header class="atc-topbar">
        <span class="atc-brand">atc</span>
        <span class="atc-toggle">Angular · <a [href]="reactUrl">React</a></span>
        <atc-feed-badge />
        <a
          class="atc-source"
          [href]="sourceUrl"
          target="_blank"
          rel="noreferrer"
          >View the core file</a
        >
      </header>
      <atc-assistant />
    </main>
  `,
})
export class App {
  protected readonly reactUrl = `../react/${window.location.search}`;
  protected readonly sourceUrl = SOURCE_URLS.angular;

  constructor() {
    const stop = startAtcFeed({
      store: inject(ATC_STORE),
      search: window.location.search,
      baseUri: document.baseURI,
    });
    inject(DestroyRef).onDestroy(stop);
  }
}
