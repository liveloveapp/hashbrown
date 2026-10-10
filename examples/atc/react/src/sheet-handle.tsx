import { SHEET_DRAG_THRESHOLD, type SheetEvent } from '@atc/shared';
import { type PointerEvent, useRef } from 'react';

/**
 * The drag handle of the phone bottom sheet. It is a real button: Enter or
 * Space taps it (open fully, or close from full), and dragging it moves the
 * sheet between its peek, half and full snaps. Hidden on wide screens, where
 * the chat is a plain side panel.
 */
export function SheetHandle({
  expanded,
  onMove,
}: {
  /** Whether the sheet is fully open. */
  expanded: boolean;
  /** Called with each drag, or a tap as a drag of 0. */
  onMove: (event: SheetEvent) => void;
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
    dragged.current = Math.abs(deltaY) >= SHEET_DRAG_THRESHOLD;
    if (dragged.current) {
      onMove({ type: 'drag', deltaY });
    }
  };
  const click = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onMove({ type: 'drag', deltaY: 0 });
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
