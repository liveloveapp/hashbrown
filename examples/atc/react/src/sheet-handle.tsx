import { sheetAfterDrag } from '@atc/shared';
import { type PointerEvent, useRef } from 'react';

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
export function SheetHandle({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    startY.current = event.clientY;
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null) {
      return;
    }
    const deltaY = event.clientY - startY.current;
    startY.current = null;
    // A real drag settles here; a tap falls through to the click handler.
    dragged.current = Math.abs(deltaY) >= 24;
    if (dragged.current) {
      onExpandedChange(sheetAfterDrag(expanded, deltaY));
    }
  };
  const click = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onExpandedChange(!expanded);
  };

  return (
    <div className="atc-sheet-handle-host">
      <button
        type="button"
        className="atc-sheet-handle"
        aria-controls="atc-chat-sheet"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse chat' : 'Expand chat'}
        onPointerDown={start}
        onPointerUp={end}
        onPointerCancel={() => {
          startY.current = null;
        }}
        onClick={click}
      >
        <span className="atc-sheet-grip" aria-hidden="true" />
      </button>
    </div>
  );
}
