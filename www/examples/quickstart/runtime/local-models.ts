import { s } from '@hashbrownai/core';

/** The complete trip brief extracted by the local model. */
export const tripBriefSchema = s.object('A short trip brief', {
  destination: s.string('The destination city or place'),
  days: s.integer('The number of days, from 1 to 14'),
});

/** A parsed trip brief; application bounds are checked separately. */
export type TripBrief = s.Infer<typeof tripBriefSchema>;

/** Native availability states understood by this example. */
export type NativeAvailability =
  'available' | 'downloadable' | 'downloading' | 'unavailable';

/** The native text-language options shared with the Chrome transport. */
export interface NativeModelOptions {
  expectedOutputs: { type: 'text'; languages: 'en'[] }[];
  signal?: AbortSignal;
  monitor?: (monitor: EventTarget) => void;
}

/** The small native API surface used only for explicit model preparation. */
export interface NativeLanguageModel {
  availability(
    options: Pick<NativeModelOptions, 'expectedOutputs'>,
  ): Promise<NativeAvailability | { status: NativeAvailability }>;
  create(options: NativeModelOptions): Promise<{ destroy(): void }>;
}

/** Inputs for one cancellable preparation attempt. */
export interface PrepareLocalModelOptions {
  readonly model: NativeLanguageModel | undefined;
  readonly signal: AbortSignal;
  readonly onProgress?: (percent: number) => void;
}

/** Runtime state required to display a fresh, complete trip brief. */
export interface TripBriefRun {
  readonly requestId: string | undefined;
  readonly cancelled: boolean;
  readonly messages: readonly {
    readonly id?: string;
    readonly role: string;
    readonly content?: unknown;
  }[];
  readonly isSending: boolean;
  readonly isReceiving: boolean;
  readonly isGenerating: boolean;
  readonly isLoading: boolean;
  readonly error?: unknown;
  readonly finishReason?: string;
}

/** Reads the native API without opening a session or starting a download. */
export function getNativeLanguageModel(): NativeLanguageModel | undefined {
  const model = (globalThis as { LanguageModel?: unknown }).LanguageModel;
  if (
    (typeof model !== 'object' && typeof model !== 'function') ||
    model === null ||
    !('availability' in model) ||
    typeof model.availability !== 'function' ||
    !('create' in model) ||
    typeof model.create !== 'function'
  )
    return undefined;
  return model as NativeLanguageModel;
}

function aborted(): DOMException {
  return new DOMException('Model preparation stopped.', 'AbortError');
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(aborted());
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', stop);
        if (signal.aborted) reject(aborted());
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', stop);
        reject(error);
      },
    );
  });
}

/**
 * Checks availability and, when needed, prepares the model after a user action.
 * Preparation sessions are always destroyed, including sessions resolved after cancellation.
 */
export async function prepareLocalModel({
  model,
  signal,
  onProgress,
}: PrepareLocalModelOptions): Promise<void> {
  if (signal.aborted) throw aborted();
  if (!model)
    throw new Error(
      'Chrome Prompt API is missing. Use a supported desktop Chrome browser, then select Prepare model to try again.',
    );
  // These match experimental_chrome({ outputLanguage: 'en' }) text defaults.
  const options: NativeModelOptions = {
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const availability = await withAbort(model.availability(options), signal);
  const status =
    typeof availability === 'string' ? availability : availability.status;
  if (status === 'available') return;
  if (status === 'unavailable')
    throw new Error(
      'The local model is unavailable. Check Chrome device and Prompt API requirements, then select Prepare model to try again.',
    );
  if (status !== 'downloadable' && status !== 'downloading')
    throw new Error(
      'Chrome returned an unknown availability result. Select Prepare model to try again.',
    );

  let active = true;
  const listeners: (() => void)[] = [];
  let creation: ReturnType<NativeLanguageModel['create']> | undefined;
  let session: Awaited<ReturnType<NativeLanguageModel['create']>> | undefined;
  try {
    creation = model.create({
      ...options,
      signal,
      monitor: (monitor) => {
        if (!active || signal.aborted) return;
        const progress = (event: Event) => {
          if (!active || signal.aborted) return;
          const { loaded, total } = event as Event & {
            loaded?: number;
            total?: number;
          };
          if (typeof loaded !== 'number' || !Number.isFinite(loaded)) return;
          const fraction =
            typeof total === 'number' && Number.isFinite(total) && total > 0
              ? loaded / total
              : loaded;
          onProgress?.(Math.round(Math.max(0, Math.min(1, fraction)) * 100));
        };
        monitor.addEventListener('downloadprogress', progress);
        listeners.push(() =>
          monitor.removeEventListener('downloadprogress', progress),
        );
      },
    });
    session = await withAbort(creation, signal);
  } finally {
    active = false;
    for (const remove of listeners) remove();
    if (session) session.destroy();
    else
      void creation?.then(
        (lateSession) => lateSession.destroy(),
        () => undefined,
      );
  }
}

/** Returns a trimmed independent trip brief only when application bounds pass. */
export function validateTripBrief(input: unknown): TripBrief | undefined {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('destination' in input) ||
    typeof input.destination !== 'string' ||
    !('days' in input) ||
    typeof input.days !== 'number' ||
    !Number.isInteger(input.days)
  )
    return undefined;
  const destination = input.destination.trim();
  if (
    destination.length < 1 ||
    destination.length > 80 ||
    input.days < 1 ||
    input.days > 14
  )
    return undefined;
  return { destination, days: input.days };
}

/** Withholds partial, stale, stopped or failed runs until a valid result settles. */
export function getReadyTripBrief(run: TripBriefRun): TripBrief | undefined {
  if (
    !run.requestId ||
    run.cancelled ||
    run.error ||
    run.isSending ||
    run.isReceiving ||
    run.isGenerating ||
    run.isLoading ||
    (run.finishReason !== undefined && run.finishReason !== 'stop')
  )
    return undefined;
  const reversed = [...run.messages].reverse();
  const userIndex = reversed.findIndex((message) => message.role === 'user');
  if (userIndex < 0 || reversed[userIndex].id !== run.requestId)
    return undefined;
  const answer = reversed
    .slice(0, userIndex)
    .find((message) => message.role === 'assistant');
  return validateTripBrief(answer?.content);
}
