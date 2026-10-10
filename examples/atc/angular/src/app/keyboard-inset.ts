import { DestroyRef, Directive, inject, signal } from '@angular/core';

/**
 * Publishes the on-screen keyboard's height as `--atc-kb` on its host, from
 * `visualViewport`, so the phone sheet can sit above it (iOS Safari does not
 * resize the layout viewport). A no-op where `visualViewport` is missing.
 */
@Directive({
  selector: '[atcKeyboardInset]',
  host: { '[style.--atc-kb]': 'inset()' },
})
export class KeyboardInsetDirective {
  protected readonly inset = signal('0px');

  constructor() {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const update = () =>
      this.inset.set(
        `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`,
      );
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    });
  }
}
