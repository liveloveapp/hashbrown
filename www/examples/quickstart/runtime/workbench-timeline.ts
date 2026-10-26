import type { WorkbenchEvent } from './workbench';

/** A meaningful transition pointing at its original, immutable captured frame. */
export interface WorkbenchMilestone {
  readonly index: number;
  readonly turn: number;
  readonly label: string;
}

/** Summarizes repetitive streaming events without deleting or resampling any frames. */
export function workbenchMilestones(
  events: readonly WorkbenchEvent[],
): readonly WorkbenchMilestone[] {
  const firstChunks = new Set<number>();
  const lastParsed = new Map<number, number>();
  events.forEach((event, index) => {
    if (event.kind === 'parsed') lastParsed.set(event.turn, index);
  });
  return events.flatMap((event, index) => {
    const payload = event.payload;
    const chunk =
      event.kind === 'event' &&
      payload !== null &&
      typeof payload === 'object' &&
      'type' in payload &&
      payload.type === 'TEXT_MESSAGE_CONTENT';
    let label: string | undefined;
    if (chunk && !firstChunks.has(event.turn)) {
      firstChunks.add(event.turn);
      label = 'Streaming JSON';
    } else if (
      event.kind === 'parsed' &&
      lastParsed.get(event.turn) === index
    ) {
      label = 'Parsed output';
    } else {
      const names: Partial<Record<WorkbenchEvent['kind'], string>> = {
        user: 'Prompt',
        request: 'Request',
        tool: 'Tool result',
        complete: 'Complete',
        accept: 'Plan accepted',
        error: 'Error',
        cancel: 'Cancelled',
      };
      label = names[event.kind];
    }
    return label ? [{ index, turn: event.turn, label }] : [];
  });
}
