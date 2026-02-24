/**
 * Parsed SSE event payload.
 *
 * @public
 */
export type SseEvent = {
  event: string | null;
  data: string;
};

/**
 * Options for parsing SSE streams.
 *
 * @public
 */
export type ParseSseStreamOptions = {
  signal?: AbortSignal;
  stopOnDone?: boolean;
  doneSignal?: string;
};

/**
 * Parse a ReadableStream of SSE bytes into structured events.
 *
 * @public
 * @param stream - ReadableStream producing Uint8Array chunks.
 * @param options - Parser options.
 * @returns Async iterator of parsed SSE events.
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSseStreamOptions = {},
): AsyncGenerator<SseEvent, void, unknown> {
  const { signal, stopOnDone = true, doneSignal = '[DONE]' } = options;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName: string | null = null;
  let dataLines: string[] = [];

  const resetEvent = () => {
    eventName = null;
    dataLines = [];
  };

  const emitEvent = async function* (): AsyncGenerator<
    SseEvent,
    boolean,
    unknown
  > {
    if (eventName === null && dataLines.length === 0) {
      return false;
    }

    const data = dataLines.join('\n');
    const event: SseEvent = {
      event: eventName,
      data,
    };

    resetEvent();

    if (stopOnDone && data === doneSignal) {
      return true;
    }

    yield event;
    return false;
  };

  const handleLine = async function* (
    rawLine: string,
  ): AsyncGenerator<SseEvent, boolean, unknown> {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      const result = yield* emitEvent();
      return result;
    }

    if (line.startsWith(':')) {
      return false;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);

    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      eventName = value.length > 0 ? value : null;
      return false;
    }

    if (field === 'data') {
      dataLines = [...dataLines, value];
    }

    return false;
  };

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        reader.cancel().catch(() => {
          // ignore
        });
      },
      { once: true },
    );
  }

  if (signal?.aborted) {
    await reader.cancel();
    return;
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error('Parsing aborted');
      }

      const { value: chunk, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(chunk, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const doneSignalReceived = yield* handleLine(line);
        if (doneSignalReceived) {
          return;
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) {
      const doneSignalReceived = yield* handleLine(buffer);
      if (doneSignalReceived) {
        return;
      }
    }

    if (eventName !== null || dataLines.length > 0) {
      const doneSignalReceived = yield* emitEvent();
      if (doneSignalReceived) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
