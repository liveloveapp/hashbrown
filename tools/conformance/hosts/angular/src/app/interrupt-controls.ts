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
        [disabled]="disabled() || !batch() || isResuming()"
        (click)="submit()"
      >
        Resume
      </button>
      <button
        data-testid="decline"
        type="button"
        [disabled]="disabled() || !batch() || isResuming()"
        (click)="submit('decline')"
      >
        Decline
      </button>
      <button
        data-testid="cancel"
        type="button"
        [disabled]="disabled() || !batch() || isResuming()"
        (click)="submit('cancel')"
      >
        Cancel
      </button>
      <button
        data-testid="mixed-decisions"
        type="button"
        [disabled]="
          disabled() || batch()?.interrupts.length !== 3 || isResuming()
        "
        (click)="submit('mixed')"
      >
        Approve, decline, cancel
      </button>
      <button
        data-testid="capture-resume"
        type="button"
        [disabled]="disabled() || !batch() || isResuming()"
        (click)="captureResume()"
      >
        Capture resume command
      </button>
      <button
        data-testid="replay-captured-resume"
        type="button"
        [disabled]="disabled() || !batch() || !capturedResume() || isResuming()"
        (click)="replayCapturedResume()"
      >
        Replay captured resume command
      </button>
      <div data-testid="resume-error">{{ error() }}</div>
    </section>
  `,
})
export class InterruptControls {
  /** Whether application recovery policy blocks decisions. */
  readonly disabled = input(false);
  /** The currently displayed immutable interrupt batch. */
  readonly batch = input.required<PendingInterruptBatch | undefined>();
  /** Whether a complete resume interaction is in progress. */
  readonly isResuming = input.required<boolean>();
  /** The runtime command invoked by the fixture form. */
  readonly resume = input.required<(options: ResumeOptions) => void>();
  protected readonly error = signal('');
  protected readonly capturedResume = signal<(() => void) | undefined>(
    undefined,
  );

  /** Captures an intentionally stale public command solely for fixture guard verification. */
  protected captureResume(): void {
    const batch = this.batch();
    if (!batch) return;
    const resume = this.resume();
    const options: ResumeOptions = {
      batchId: batch.id,
      entries: batch.interrupts.map(({ id }) => ({
        interruptId: id,
        status: 'resolved',
        payload: { approved: true },
      })),
    };
    this.capturedResume.set(() => resume(options));
  }

  /** Replays the captured command without using it as current batch ownership. */
  protected replayCapturedResume(): void {
    this.error.set('');
    try {
      this.capturedResume()?.();
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    }
  }

  protected submit(
    decision: 'approve' | 'decline' | 'cancel' | 'mixed' = 'approve',
  ): void {
    const batch = this.batch();
    if (!batch) return;
    this.error.set('');
    try {
      this.resume()({
        batchId: batch.id,
        entries: batch.interrupts.map(({ id }, index) => {
          const selected =
            decision === 'mixed'
              ? (['approve', 'decline', 'cancel'] as const)[index]
              : decision;
          return {
            interruptId: id,
            status: selected === 'cancel' ? 'cancelled' : 'resolved',
            ...(selected === 'cancel'
              ? {}
              : { payload: { approved: selected === 'approve' } }),
          };
        }),
      });
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    }
  }
}
