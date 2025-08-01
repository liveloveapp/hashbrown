import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Glass‑style surface that provides a CSS‑painted gradient border
 * and exposes the same CSS custom properties as the original Qwik
 * version.  The component is a thin wrapper that simply projects
 * its content (`<ng-content>`) and adds the required class plus
 * default CSS variables.
 *
 * ✔️ Standalone (no NgModule needed)
 * ✔️ OnPush change detection
 * ✔️ Native class & style bindings (no `ngClass` / `ngStyle`)
 * ✔️ Browser‑only CSS.registerProperty / paintWorklet guard
 */
@Component({
  selector: 'www-glass',
  host: {
    class: 'glass',
  },
  template: ` <ng-content></ng-content> `,
  styles: `
    :host {
      display: flex;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glass {
  constructor(@Inject(PLATFORM_ID) platformId: object) {
    // All CSS Houdini APIs must run only in the browser.
    if (isPlatformBrowser(platformId)) {
      const css: any = (window as any).CSS;

      if (css?.registerProperty) {
        // Try‑register each property; ignore duplicates on HMR / re‑instantiation.
        [
          {
            name: '--glass-border-radius',
            syntax: '<length>',
            initialValue: '0px',
          },
          {
            name: '--glass-border-opacity',
            syntax: '<percentage>',
            initialValue: '0%',
          },
          {
            name: '--glass-background-color-a',
            syntax: '<color>',
            initialValue: 'rgba(69, 86, 85, 0.12)',
          },
          {
            name: '--glass-background-color-b',
            syntax: '<color>',
            initialValue: 'rgba(95, 117, 249, 0.05)',
          },
          {
            name: '--glass-background-color-c',
            syntax: '<color>',
            initialValue: 'rgba(181, 87, 255, 0)',
          },
        ].forEach((p) => {
          try {
            css.registerProperty({ ...p, inherits: false });
          } catch {
            /* Already registered ― safe to ignore. */
          }
        });
      }

      // Optional Houdini Paint Worklet for the animated gradient border.
      if (css?.paintWorklet?.addModule) {
        css.paintWorklet.addModule('/worklet/glass-border.js');
      }
    }
  }
}
