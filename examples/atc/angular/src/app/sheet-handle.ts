import { sheetAfterDrag } from '@atc/shared';
import { ChangeDetectionStrategy, Component, model } from '@angular/core';

/**
 * Whether focus landing on `target` should open the sheet: anything inside it
 * except the handle, whose own click toggles (a pointer press focuses the
 * button first, which would otherwise open and immediately close the sheet).
 */
export function focusOpensSheet(target: EventTarget | null): boolean {
  return !(
    target instanceof Element && target.closest('.atc-sheet-handle') !== null
  );
}

/**
 * The drag handle of the phone bottom sheet. It is a real button: Enter or
 * Space toggles it, and dragging it up or down opens or closes the sheet.
 * Hidden on wide screens, where the chat is a plain side panel.
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
export class SheetHandleComponent {
  /** Whether the sheet is open; two-way bindable. */
  readonly expanded = model(false);
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
    this.dragged = Math.abs(deltaY) >= 24;
    if (this.dragged) {
      this.expanded.set(sheetAfterDrag(this.expanded(), deltaY));
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
    this.expanded.update((open) => !open);
  }
}
