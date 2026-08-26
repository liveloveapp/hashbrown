import { EventType } from '@ag-ui/core';
import type { ServerResponse } from 'node:http';

function containsTerminalEvent(chunk: unknown): boolean {
  if (typeof chunk !== 'string') {
    return false;
  }

  return chunk.split(/\r?\n/).some((line) => {
    if (!line.startsWith('data:')) {
      return false;
    }

    try {
      const event = JSON.parse(line.slice('data:'.length).trim()) as {
        readonly type?: unknown;
      };

      return (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      );
    } catch {
      return false;
    }
  });
}

/** Closes an HTTP response after forwarding a complete terminal SSE frame. */
export function endResponseAfterTerminalEvent(
  response: ServerResponse,
  onTerminal: () => void = () => undefined,
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
    if (containsTerminalEvent(chunk)) {
      onTerminal();
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
