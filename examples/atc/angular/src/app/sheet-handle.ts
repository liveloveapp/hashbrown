import { SHEET_DRAG_THRESHOLD, type SheetEvent } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * The drag handle of the phone bottom sheet. It is a real button: Enter or
 * Space taps it (open fully, or close from full), and dragging it moves the
 * sheet between its peek, half and full snaps. Hidden on wide screens, where
 * the chat is a plain side panel.
 */
@Component({
  selector: 'atc-sheet-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-sheet-handle-host' },
  template: `
    <button
      type="button"
      class="atc-sheet-handle"
      aria-controls="atc-chat-sheet"
      [attr.aria-expanded]="expanded()"
      [attr.aria-label]="expanded() ? 'Collapse chat' : 'Expand chat'"
      (pointerdown)="start($event)"
      (pointerup)="end($event)"
      (pointercancel)="cancel()"
      (click)="click()"
    >
      <span class="atc-sheet-grip" aria-hidden="true"></span>
    </button>
  `,
})
export class SheetHandle {
  /** Whether the sheet is fully open. */
  readonly expanded = input(false);
  /** Emits each drag, or a tap as a drag of 0. */
  readonly moved = output<SheetEvent>();
  private startY: number | null = null;
  private dragged = false;

  protected start(event: PointerEvent): void {
    this.startY = event.clientY;
    this.dragged = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected end(event: PointerEvent): void {
    if (this.startY === null) {
      return;
    }
    const deltaY = event.clientY - this.startY;
    this.startY = null;
    // A real drag settles here; a tap falls through to the click handler.
    this.dragged = Math.abs(deltaY) >= SHEET_DRAG_THRESHOLD;
    if (this.dragged) {
      this.moved.emit({ type: 'drag', deltaY });
    }
  }

  protected cancel(): void {
    this.startY = null;
  }

  protected click(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.moved.emit({ type: 'drag', deltaY: 0 });
  }
}
