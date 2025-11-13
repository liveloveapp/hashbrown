import { Component, computed, input } from '@angular/core';
import { createTextFragments } from './text-fragments';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'app-heading',
  template: `
    @switch (headingLevel()) {
      @case (1) {
        <h1>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h1>
      }
      @case (2) {
        <h2>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h2>
      }
      @case (3) {
        <h3>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h3>
      }
      @case (4) {
        <h4>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h4>
      }
      @case (5) {
        <h5>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h5>
      }
      @case (6) {
        <h6>
          @for (fragment of fragments(); track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
        </h6>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 20px;
      margin-bottom: 12px;
      width: var(--article-width);
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0;
      font-weight: 600;
      line-height: 1.2;
      color: var(--chocolate-brown);
    }

    h1 {
      font-size: 32px;
    }

    h2 {
      font-size: 28px;
    }

    h3 {
      font-size: 24px;
    }

    h4 {
      font-size: 20px;
    }

    h5 {
      font-size: 18px;
    }

    h6 {
      font-size: 16px;
    }

    span {
      opacity: 1;
      transition: opacity 0.5s ease;

      @starting-style {
        opacity: 0;
      }
    }
  `,
})
export class Heading {
  readonly text = input.required<string>();
  readonly level = input<number>(2);
  readonly headingLevel = computed<HeadingLevel>(() => {
    const value = this.level();
    const normalized =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value)
        : 2;
    return Math.min(6, Math.max(1, normalized)) as HeadingLevel;
  });
  readonly fragments = computed(() => createTextFragments(this.text()));
}
