import { Component, computed, input } from '@angular/core';
import { exposeComponent, MagicText } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'app-heading',
  imports: [MagicText],
  template: `
    <div class="wrapper">
      @switch (headingLevel()) {
        @case (1) {
          <h1 class="heading h1">
            <hb-magic-text [text]="text()" />
          </h1>
        }
        @case (2) {
          <h2 class="heading h2">
            <hb-magic-text [text]="text()" />
          </h2>
        }
        @case (3) {
          <h3 class="heading h3">
            <hb-magic-text [text]="text()" />
          </h3>
        }
        @case (4) {
          <h4 class="heading h4">
            <hb-magic-text [text]="text()" />
          </h4>
        }
        @case (5) {
          <h5 class="heading h5">
            <hb-magic-text [text]="text()" />
          </h5>
        }
        @case (6) {
          <h6 class="heading h6">
            <hb-magic-text [text]="text()" />
          </h6>
        }
      }
    </div>
  `,
  styles: `
    .wrapper {
      display: block;
      width: var(--article-width, 100%);
      margin-top: 20px;
      margin-bottom: 12px;
    }

    .heading {
      margin: 0;
      font-weight: 500;
      line-height: 1.2;
      color: var(--gray, rgba(94, 92, 90, 1));
    }

    .h1 {
      font-size: 24px;
    }

    .h2 {
      font-size: 20px;
    }

    .h3 {
      font-size: 18px;
    }

    .h4 {
      font-size: 16px;
    }

    .h5 {
      font-size: 14px;
    }

    .h6 {
      font-size: 12px;
    }
  `,
})
export class HeadingComponent {
  readonly text = input.required<string>();
  readonly level = input<number | null>(2);

  protected readonly headingLevel = computed(() => clampLevel(this.level()));
}

const clampLevel = (value: number | null): HeadingLevel => {
  const numericLevel =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 2;
  const clamped = Math.min(6, Math.max(1, numericLevel)) as HeadingLevel;
  return clamped;
};

export const exposedHeading = exposeComponent(HeadingComponent, {
  name: 'h',
  description: 'Show a heading to separate sections with configurable level',
  input: {
    text: s.streaming.string('The text to show in the heading'),
    level: s.anyOf([
      s.nullish(),
      s.number('Heading level from 1 (largest) to 6 (smallest); defaults to 2'),
    ]),
  },
});
