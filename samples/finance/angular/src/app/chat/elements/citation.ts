import { Component, computed, input } from '@angular/core';
import { createTextFragments } from './text-fragments';

@Component({
  selector: 'app-citation',
  template: `
    <figure>
      <blockquote>
        @for (fragment of fragments(); track fragment.id) {
          <span>{{ fragment.text }}</span>
        }
      </blockquote>

      @if (source().trim().length > 0) {
        <figcaption>— {{ source() }}</figcaption>
      }
    </figure>
  `,
  styles: [
    `
      :host {
        display: block;
        margin: 16px 0;
      }

      figure {
        margin: 0;
      }

      blockquote {
        margin: 0;
        padding: 12px 16px;
        border-left: 4px solid var(--sky-blue);
        background-color: rgba(242, 248, 255, 0.6);
        font-style: italic;
        color: var(--gray-dark);
        line-height: 1.4;
      }

      figcaption {
        margin-top: 8px;
        font-size: 14px;
        text-align: right;
        color: var(--gray-medium);
      }

      span {
        opacity: 1;
        transition: opacity 0.5s ease;

        @starting-style {
          opacity: 0;
        }
      }
    `,
  ],
})
export class Citation {
  readonly text = input.required<string>();
  readonly source = input('');
  readonly fragments = computed(() => createTextFragments(this.text()));
}
