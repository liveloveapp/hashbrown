import { Component, computed, input } from '@angular/core';
import { createTextFragments } from './text-fragments';

@Component({
  selector: 'app-paragraph',
  template: `
    <p>
      @for (fragment of fragments(); track fragment.id) {
        <span>{{ fragment.text }}</span>
      }
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
        width: var(--article-width);
      }

      p {
        margin-bottom: 12px;
        line-height: 1.3;
      }

      span {
        opacity: 1;
        transition:
          opacity 0.5s ease,
          background-color 0.5s ease;
        background-color: transparent;

        @starting-style {
          opacity: 0;
          background-color: var(--color-chocolate-brown);
        }
      }
    `,
  ],
})
export class Paragraph {
  readonly text = input.required<string>();
  readonly fragments = computed(() => createTextFragments(this.text()));
}
