import { Subject } from 'rxjs';
import { normalizeSseLineEndings } from './sse-line-ending-normalizer';

interface TestHttpEvent {
  type: 'data' | 'headers';
  data?: Uint8Array;
  status?: number;
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

test('normalizes CRLF split across data chunks before completion', () => {
  const source = new Subject<TestHttpEvent>();
  const normalized = normalizeSseLineEndings<TestHttpEvent>(source);
  const chunks: Uint8Array[] = [];
  normalized.subscribe({
    next: (event) => {
      if (event.data) {
        chunks.push(event.data);
      }
    },
    error: () => undefined,
    complete: () => undefined,
  });

  source.next({
    type: 'data',
    data: new TextEncoder().encode('data: {}\r'),
  });
  source.next({ type: 'data', data: new TextEncoder().encode('\n\r') });
  source.next({ type: 'data', data: new TextEncoder().encode('\n') });

  expect(new TextDecoder().decode(concatenate(chunks))).toBe('data: {}\n\n');
});

test('normalizes lone and trailing CR while preserving UTF-8 and headers', () => {
  const source = new Subject<TestHttpEvent>();
  const normalized = normalizeSseLineEndings<TestHttpEvent>(source);
  const headerEvent: TestHttpEvent = { type: 'headers', status: 200 };
  const events: TestHttpEvent[] = [];
  normalized.subscribe({
    next: (event) => events.push(event),
    error: () => undefined,
    complete: () => undefined,
  });

  source.next(headerEvent);
  source.next({
    type: 'data',
    data: new TextEncoder().encode('data: café ☕\rdata: fin\r'),
  });
  source.complete();

  expect(events[0]).toBe(headerEvent);
  expect(
    new TextDecoder().decode(
      concatenate(events.flatMap((event) => (event.data ? [event.data] : []))),
    ),
  ).toBe('data: café ☕\ndata: fin\n');
});
