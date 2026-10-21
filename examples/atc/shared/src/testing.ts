import type { Decision, Transport, TransportRequest } from '@hashbrownai/core';

/** One AG-UI event, as a transport streams it. */
type AGUIEvent =
  Awaited<ReturnType<Transport['send']>>['events'] extends AsyncIterable<
    infer E
  >
    ? E
    : never;
import type { Aircraft } from './aircraft';
import type { AirspaceShelf, ChartAirport } from './chart';

/** A test aircraft: UAL100, a level Boeing 737 at 5,000 ft near Seattle. */
export function testAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: 'aaaaaa',
    label: 'UAL100',
    callsign: 'UAL100',
    registration: null,
    typeCode: 'B738',
    category: null,
    kind: 'jet',
    lat: 47.4,
    lon: -122.3,
    altitudeFt: 5000,
    onGround: false,
    groundSpeedKt: 200,
    trackDeg: 90,
    verticalRateFpm: 0,
    ...overrides,
  };
}

/** A test chart airport: KRDM (Redmond), part-time tower, one runway. */
export function testChartAirport(
  overrides: Partial<ChartAirport> = {},
): ChartAirport {
  return {
    code: 'KRDM',
    faa: 'RDM',
    name: 'ROBERTS FLD/REDMOND MUNI',
    city: 'REDMOND',
    state: 'OR',
    aliases: ['redmond'],
    lat: 44.254,
    lon: -121.15,
    elevationFt: 3082,
    kind: 'airport',
    towered: true,
    towerPartTime: true,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    lighting: 'limited',
    fuel: true,
    military: false,
    runways: [
      {
        id: '05/23',
        lengthFt: 7038,
        widthFt: 150,
        surface: 'ASPH',
        hard: true,
        ends: null,
        corners: null,
        bearingDeg: null,
      },
    ],
    rank: 0,
    ...overrides,
  };
}

/** A closed square `[lon, lat]` ring around (lon, lat), `half` degrees each way. */
export function squareRing(
  lon: number,
  lat: number,
  half: number,
): (readonly [number, number])[] {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

/**
 * A test airspace shelf: Portland's Class C, 1,100 to 4,000 MSL, a 1-degree
 * square. The bbox bounds the outer ring unless `overrides` sets one.
 */
export function testShelf(
  overrides: Partial<AirspaceShelf> = {},
): AirspaceShelf {
  const rings = overrides.rings ?? [squareRing(-121.5, 45.5, 0.5)];
  const outer = rings[0] ?? [];
  const lons = outer.map(([lon]) => lon);
  const lats = outer.map(([, lat]) => lat);

  return {
    id: 'KPDX-C-0',
    airport: 'KPDX',
    name: 'PORTLAND CLASS C',
    class: 'C',
    type: 'C',
    floor: { ft: 1100, ref: 'MSL' },
    ceiling: { ft: 4000, exclusive: false },
    partTime: false,
    rings,
    bbox: [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ],
    ...overrides,
  };
}

/** A scripted `/api/filter` transport; see {@link fakeFilterTransport}. */
export interface FakeFilterTransport {
  /** Pass as the hook's transport. */
  readonly transport: Transport;
  /** Every request the app sent, oldest first. */
  readonly requests: TransportRequest[];
  /** Streams more of the current answer's JSON text. */
  push(delta: string): void;
  /** Ends the current answer. */
  finish(): void;
}

/**
 * A fake model for the natural-language filter: each request starts an answer
 * that the test streams with `push` and ends with `finish`.
 */
export function fakeFilterTransport(): FakeFilterTransport {
  const requests: TransportRequest[] = [];
  let emit: (event: AGUIEvent | null) => void = () => undefined;
  let messageId = 0;

  const transport: Transport = {
    name: 'fake-filter',
    send: async (request) => {
      requests.push(request);
      const id = `m${++messageId}`;
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      const queue: (AGUIEvent | null)[] = [
        { type: 'RUN_STARTED', ...identity },
        { type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' },
      ] as AGUIEvent[];
      let wake: () => void = () => undefined;
      emit = (event) => {
        queue.push(event);
        wake();
      };

      return {
        events: (async function* () {
          for (;;) {
            while (queue.length === 0) {
              await new Promise<void>((resolve) => (wake = resolve));
            }
            const event = queue.shift();
            if (event === null || event === undefined) {
              yield { type: 'TEXT_MESSAGE_END', messageId: id } as AGUIEvent;
              yield { type: 'RUN_FINISHED', ...identity } as AGUIEvent;
              return;
            }
            yield event;
          }
        })(),
      };
    },
  };
  const current = () => messageId;

  return {
    transport,
    requests,
    push: (delta) =>
      emit({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: `m${current()}`,
        delta,
      } as AGUIEvent),
    finish: () => emit(null),
  };
}

/** What a scripted router answers for some text. */
export interface FakeRouteAnswer {
  readonly intent: 'filter' | 'chat' | 'other';
  readonly confidence: number;
  /** The probability of the `clear` answer; defaults to 0.05. */
  readonly clear?: number;
}

/** A scripted `/api/decide?kind=route` transport; see {@link fakeDecisionTransport}. */
export interface FakeDecisionTransport {
  /** Pass as the decision transport. */
  readonly transport: Decision.Transport;
  /** The text of every request the app sent, oldest first. */
  readonly requests: string[];
}

/**
 * A fake router. `answer` gets the text of each request and returns the
 * decision (or a promise of one, so a test can hold it back); `null` fails
 * the request the way a 503 without a key does.
 */
export function fakeDecisionTransport(
  answer: (
    text: string,
  ) => FakeRouteAnswer | null | Promise<FakeRouteAnswer | null>,
): FakeDecisionTransport {
  const requests: string[] = [];
  const transport: Decision.Transport = async (request) => {
    const state = request.state;
    const text =
      typeof state === 'string'
        ? state
        : String((state as { input?: unknown }).input);
    requests.push(text);
    const decided = await answer(text);
    if (decided === null) {
      throw new Error('Decision request failed with status 503');
    }

    return {
      kind: 'hashbrown.decision',
      version: 1,
      value: { intent: decided.intent, clear: (decided.clear ?? 0.05) >= 0.5 },
      meta: {
        intent: {
          confidence: decided.confidence,
          probabilities: { [decided.intent]: decided.confidence },
        },
        clear: { probability: decided.clear ?? 0.05 },
      },
    };
  };

  return { transport, requests };
}
