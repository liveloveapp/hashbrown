import type { WorkbenchLesson } from './workbench-lessons';
import { workbenchRecipeEventLabel } from './workbench-recipe-view';
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
  format?: WorkbenchLesson['format'],
): readonly WorkbenchMilestone[] {
  const firstChunks = new Set<number>();
  const lastParsed = new Map<number, number>();
  const lastError = new Map<number, number>();
  events.forEach((event, index) => {
    if (event.kind === 'parsed') lastParsed.set(event.turn, index);
    if (event.kind === 'error') lastError.set(event.turn, index);
  });
  return events.flatMap((event, index) => {
    if (event.kind === 'parsed' && lastParsed.get(event.turn) !== index)
      return [];
    if (event.kind === 'error' && lastError.get(event.turn) !== index)
      return [];
    const payload = event.payload;
    const chunk =
      event.kind === 'event' &&
      payload !== null &&
      typeof payload === 'object' &&
      'type' in payload &&
      payload.type === 'TEXT_MESSAGE_CONTENT';
    let label: string | undefined;
    if (
      event.kind === 'response' &&
      payload &&
      typeof payload === 'object' &&
      'status' in payload &&
      Number(payload.status) >= 400
    )
      return [{ index, turn: event.turn, label: `HTTP ${payload.status}` }];
    if (
      event.kind === 'event' &&
      payload &&
      typeof payload === 'object' &&
      'name' in payload &&
      payload.name === 'workbench.request-transformation'
    )
      return [{ index, turn: event.turn, label: 'Request transformed' }];
    if (
      event.kind === 'event' &&
      payload &&
      typeof payload === 'object' &&
      'name' in payload &&
      payload.name === 'workbench.system-instructions'
    )
      return [{ index, turn: event.turn, label: 'Policy observed' }];
    if (chunk && !firstChunks.has(event.turn)) {
      firstChunks.add(event.turn);
      label = format === 'text' ? 'Streaming text' : 'Streaming JSON';
    } else if (
      event.kind === 'parsed' &&
      lastParsed.get(event.turn) === index
    ) {
      label = workbenchRecipeEventLabel(event) ?? 'Parsed output';
    } else {
      const names: Partial<Record<WorkbenchEvent['kind'], string>> = {
        user: 'Prompt',
        request: 'Request',
        tool: 'Tool result',
        complete: 'Complete',
        accept: 'Plan accepted',
        error: 'Error',
        cancel: 'Cancelled',
        decision: 'Decision',
        choose: 'Suggestion applied',
      };
      label = workbenchRecipeEventLabel(event) ?? names[event.kind];
    }
    return label ? [{ index, turn: event.turn, label }] : [];
  });
}
