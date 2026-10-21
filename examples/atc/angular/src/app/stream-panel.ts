import type { StreamBlock } from '@atc/shared';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A dark JSON panel for "Show the stream": one titled block per layer. The
 * text is untrusted model output, so it is only ever interpolated as text.
 * A parent places it with a class (for example on the map).
 */
@Component({
  selector: 'atc-stream-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'atc-stream',
    role: 'group',
    'data-testid': 'stream-panel',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @for (block of blocks(); track $index) {
      <section class="atc-stream-block">
        <p class="atc-stream-title">{{ block.title }}</p>
        <pre class="atc-stream-text" tabindex="0">{{ block.text }}</pre>
      </section>
    }
  `,
})
export class StreamPanel {
  /** The blocks to show, in order. */
  readonly blocks = input.required<readonly StreamBlock[]>();
  /** The panel's accessible name. */
  readonly label = input('Stream');
}
