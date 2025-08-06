import {
  AfterViewInit,
  Component,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { Alert } from '../components/Alert';
import { Header } from '../components/Header';

@Component({
  imports: [RouterOutlet, Header, Alert],
  template: `
    <www-header />
    <main class="examples">
      @if (isSafari()) {
        <div class="alert">
          <www-alert type="warn">
            <p>
              Due to limitations, our stackblitz examples will not run in
              Safari. We tried turning the fryer up to 11, but it didn't work.
            </p>
          </www-alert>
        </div>
      } @else {
        @defer (when isBrowser) {
          <router-outlet></router-outlet>
        }
      }
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .examples {
      display: flex;
      flex: 1 auto;

      > .alert {
        align-self: center;
        width: 320px;
        margin: 0 auto;
      }
    }
  `,
})
export default class ExamplesPage implements AfterViewInit {
  platformId = inject(PLATFORM_ID);
  isBrowser = isPlatformBrowser(this.platformId);
  isSafari = signal(false);

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      const ua = navigator.userAgent;
      this.isSafari.set(/webkit/i.test(ua) && !/edge|chrome/i.test(ua));
    }
  }
}
