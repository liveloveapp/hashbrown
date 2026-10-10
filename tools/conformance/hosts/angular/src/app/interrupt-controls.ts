import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import type { PendingInterruptBatch, ResumeOptions } from '@hashbrownai/core';

/** Displays a batch and submits a complete fixture response through the public API. */
@Component({
  selector: 'runtime-interrupt-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <ul>
        @for (interrupt of batch()?.interrupts ?? []; track interrupt.id) {
          <li data-testid="interrupt-message">
            {{ interrupt.message ?? interrupt.reason }}
          </li>
        }
      </ul>
      <div data-testid="interrupt-count">
        {{ (batch()?.interrupts ?? []).length }}
      </div>
      <div data-testid="interrupt-batch-id">{{ batch()?.id ?? '' }}</div>
      <div data-testid="is-resuming">{{ isResuming() ? 'true' : 'false' }}</div>
      <button
        data-testid="resume"
        type="button"
        [disabled]="!batch() || isResuming()"
        (click)="submit()"
      >
        Resume
      </button>
      <div data-testid="resume-error">{{ error() }}</div>
    </section>
  `,
})
export class InterruptControls {
  /** The currently displayed immutable interrupt batch. */
  readonly batch = input.required<PendingInterruptBatch | undefined>();
  /** Whether a complete resume interaction is in progress. */
  readonly isResuming = input.required<boolean>();
  /** The runtime command invoked by the fixture form. */
  readonly resume = input.required<(options: ResumeOptions) => void>();
  protected readonly error = signal('');

  protected submit(): void {
    const batch = this.batch();
    if (!batch) return;
    this.error.set('');
    try {
      this.resume()({
        batchId: batch.id,
        entries: batch.interrupts.map(({ id }) => ({
          interruptId: id,
          status: 'resolved',
          payload: { approved: true },
        })),
      });
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    }
  }
}
