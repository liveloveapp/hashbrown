import { expect, test } from 'vitest';
import {
  getReadyTripBrief,
  type NativeLanguageModel,
  prepareLocalModel,
  type TripBriefRun,
  validateTripBrief,
} from '../../examples/quickstart/runtime/local-models';

const complete: TripBriefRun = {
  requestId: 'trip-1',
  cancelled: false,
  messages: [
    { id: 'trip-1', role: 'user', content: 'Three days in Lisbon.' },
    { role: 'assistant', content: { destination: ' Lisbon ', days: 3 } },
  ],
  isSending: false,
  isReceiving: false,
  isGenerating: false,
  isLoading: false,
  finishReason: 'stop',
};

test('validates a bounded typed trip brief without mutating its input', () => {
  const input = { destination: ' Lisbon ', days: 3 };

  const result = validateTripBrief(input);

  expect(result).toEqual({ destination: 'Lisbon', days: 3 });
  expect(input).toEqual({ destination: ' Lisbon ', days: 3 });
  for (const invalid of [
    null,
    {},
    { destination: '', days: 3 },
    { destination: 'x'.repeat(81), days: 3 },
    { destination: 'Lisbon', days: 0 },
    { destination: 'Lisbon', days: 15 },
    { destination: 'Lisbon', days: 1.5 },
    { destination: 'Lisbon', days: '3' },
  ]) {
    expect(validateTripBrief(invalid)).toBeUndefined();
  }
});

test('requires a fresh completed successful trip brief and every busy flag to settle', () => {
  const blocked = [
    ...['isSending', 'isReceiving', 'isGenerating', 'isLoading'].map(
      (flag) => ({ ...complete, [flag]: true }),
    ),
    { ...complete, requestId: 'next-trip' },
    { ...complete, requestId: undefined },
    { ...complete, cancelled: true },
    { ...complete, error: new Error('failed') },
    { ...complete, finishReason: 'length' },
    { ...complete, finishReason: 'other' },
    {
      ...complete,
      messages: [
        ...complete.messages,
        { id: 'next', role: 'user', content: 'New trip' },
      ],
    },
  ];

  const result = getReadyTripBrief(complete);

  expect(result).toEqual({ destination: 'Lisbon', days: 3 });
  for (const run of blocked) expect(getReadyTripBrief(run)).toBeUndefined();
});

test('accepts a completed native trip brief without optional finish-reason metadata', () => {
  const nativeCompletion = { ...complete, finishReason: undefined };

  const result = getReadyTripBrief(nativeCompletion);

  expect(result).toEqual({ destination: 'Lisbon', days: 3 });
});

test('available preparation checks the transport language options without creating a session', async () => {
  const calls: unknown[] = [];
  const model: NativeLanguageModel = {
    availability: async (options) => {
      calls.push(options);
      return 'available';
    },
    create: async () => {
      throw new Error('must not create');
    },
  };

  await prepareLocalModel({ model, signal: new AbortController().signal });

  expect(calls).toEqual([
    { expectedOutputs: [{ type: 'text', languages: ['en'] }] },
  ]);
});

test('explicit downloadable preparation reports progress and destroys its session', async () => {
  const progress: number[] = [];
  let destroyed = 0;
  const model: NativeLanguageModel = {
    availability: async () => 'downloadable',
    create: async (options) => {
      expect(options.expectedOutputs).toEqual([
        { type: 'text', languages: ['en'] },
      ]);
      const monitor = new EventTarget();
      options.monitor?.(monitor);
      monitor.dispatchEvent(
        Object.assign(new Event('downloadprogress'), { loaded: 0.5 }),
      );
      return {
        destroy: () => {
          destroyed += 1;
        },
      };
    },
  };

  await prepareLocalModel({
    model,
    signal: new AbortController().signal,
    onProgress: (value) => progress.push(value),
  });

  expect(progress).toEqual([50]);
  expect(destroyed).toBe(1);
});

test('cancelled preparation rejects promptly and destroys a session that resolves late', async () => {
  const controller = new AbortController();
  let finish!: (session: { destroy(): void }) => void;
  let monitor!: EventTarget;
  let started!: () => void;
  const creating = new Promise<void>((resolve) => {
    started = resolve;
  });
  let destroyed = 0;
  const progress: number[] = [];
  const model: NativeLanguageModel = {
    availability: async () => 'downloading',
    create: (options) => {
      monitor = new EventTarget();
      options.monitor?.(monitor);
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const preparation = prepareLocalModel({
    model,
    signal: controller.signal,
    onProgress: (value) => progress.push(value),
  });
  await creating;

  controller.abort();
  await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
  monitor.dispatchEvent(
    Object.assign(new Event('downloadprogress'), { loaded: 1 }),
  );
  finish({
    destroy: () => {
      destroyed += 1;
    },
  });
  await Promise.resolve();
  await Promise.resolve();

  expect(progress).toEqual([]);
  expect(destroyed).toBe(1);
});

test('missing, unavailable, unknown and failed native APIs produce actionable preparation errors', async () => {
  const signal = new AbortController().signal;
  const create = async () => ({
    destroy() {
      /* no preparation resources */
    },
  });

  const results = [
    prepareLocalModel({ model: undefined, signal }),
    prepareLocalModel({
      model: { availability: async () => 'unavailable', create },
      signal,
    }),
    prepareLocalModel({
      model: { availability: async () => 'unknown' as 'available', create },
      signal,
    }),
    prepareLocalModel({
      model: {
        availability: async () => 'downloadable',
        create: async () => {
          throw new Error('Download failed');
        },
      },
      signal,
    }),
  ];

  await expect(results[0]).rejects.toThrow(/Chrome|Prompt API/);
  await expect(results[1]).rejects.toThrow(/unavailable/i);
  await expect(results[2]).rejects.toThrow(/availability/i);
  await expect(results[3]).rejects.toThrow('Download failed');
});

test('preparation removes progress listeners when native create throws synchronously', async () => {
  const monitor = new EventTarget();
  const progress: number[] = [];
  const model: NativeLanguageModel = {
    availability: async () => 'downloadable',
    create: (options) => {
      options.monitor?.(monitor);
      throw new Error('Native create failed');
    },
  };

  await expect(
    prepareLocalModel({
      model,
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
    }),
  ).rejects.toThrow('Native create failed');
  monitor.dispatchEvent(
    Object.assign(new Event('downloadprogress'), { loaded: 1 }),
  );

  expect(progress).toEqual([]);
});
