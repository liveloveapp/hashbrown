import { EventType } from '@ag-ui/core';
import type { ServerResponse } from 'node:http';

/** Terminal AG-UI event decoded from one complete SSE frame. */
export interface TerminalEvent {
  /** AG-UI terminal event discriminator. */
  readonly type: EventType.RUN_FINISHED | EventType.RUN_ERROR;
  /** Run identity carried by `RUN_FINISHED`. */
  readonly runId?: string;
  /** Thread identity carried by `RUN_FINISHED`. */
  readonly threadId?: string;
}

/** Run identity used to validate an AG-UI terminal event. */
export interface RunIdentity {
  /** Active run identifier. */
  readonly runId: string;
  /** Active thread identifier. */
  readonly threadId: string;
}

/** Returns whether a terminal event belongs to the active AG-UI run. */
export function terminalEventMatchesRun(
  event: TerminalEvent,
  identity: RunIdentity,
): boolean {
  return (
    event.type === EventType.RUN_ERROR ||
    (event.runId === identity.runId && event.threadId === identity.threadId)
  );
}

function parseTerminalEvent(chunk: unknown): TerminalEvent | undefined {
  if (typeof chunk !== 'string') {
    return undefined;
  }

  const frames = chunk.split(/\r?\n\r?\n/);
  frames.pop();
  for (const frame of frames) {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith('data:')) {
        continue;
      }

      try {
        const event = JSON.parse(line.slice('data:'.length).trim()) as {
          readonly type?: unknown;
          readonly runId?: unknown;
          readonly threadId?: unknown;
        };

        if (
          event.type === EventType.RUN_FINISHED ||
          event.type === EventType.RUN_ERROR
        ) {
          return {
            type: event.type,
            ...(typeof event.runId === 'string' ? { runId: event.runId } : {}),
            ...(typeof event.threadId === 'string'
              ? { threadId: event.threadId }
              : {}),
          };
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

/** Closes an HTTP response after forwarding a complete terminal SSE frame. */
export function endResponseAfterTerminalEvent(
  response: ServerResponse,
  onTerminal: (event: TerminalEvent) => void = () => undefined,
): void {
  const originalWrite = response.write;
  const originalEnd = response.end;
  let ended = false;
  const endResponse = (...args: unknown[]): ServerResponse => {
    if (ended) {
      return response;
    }

    ended = true;
    return Reflect.apply(originalEnd, response, args) as ServerResponse;
  };

  response.end = endResponse as typeof response.end;
  response.write = ((chunk: unknown, ...args: unknown[]) => {
    const terminalEvent = parseTerminalEvent(chunk);
    if (terminalEvent) {
      onTerminal(terminalEvent);
      endResponse(chunk, ...args);
      return true;
    }

    const result = Reflect.apply(originalWrite, response, [
      chunk,
      ...args,
    ]) as boolean;

    return result;
  }) as typeof response.write;
}
