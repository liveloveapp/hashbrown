/** Selects the one native recording and rejects misspelled mode IDs. */
export function selectLocalModelModes(requested: string | undefined): string[] {
  if (requested !== undefined && requested !== 'local-models')
    throw new Error('Unknown docs local model mode');
  return ['local-models'];
}

/** Mutable controls isolated to one deterministic browser-native API fixture. */
export interface LocalModelFixture {
  availability: string;
  availabilityCalls: number;
  creates: number;
  destroys: number;
  prompts: number;
  createDelay: number;
  createFailure: boolean;
  streamDelay: number;
  output: 'valid' | 'invalid' | 'malformed' | 'truncated' | 'failed';
  destination: string;
  days: number;
  calls: { messages: unknown; options: unknown }[];
}

/**
 * Installs deterministic native API contracts without replacing the Hashbrown
 * transport. This self-contained function also runs as a browser init script.
 */
export function installLocalModelShim(
  runtime: Record<string, unknown> = globalThis as unknown as Record<
    string,
    unknown
  >,
): void {
  const fixture: LocalModelFixture = {
    availability: 'available',
    availabilityCalls: 0,
    creates: 0,
    destroys: 0,
    prompts: 0,
    createDelay: 0,
    createFailure: false,
    streamDelay: 0,
    output: 'valid',
    destination: 'Lisbon',
    days: 3,
    calls: [],
  };
  runtime['__localModelFixture'] = fixture;
  Object.defineProperty(runtime, 'LanguageModel', {
    configurable: true,
    writable: true,
    value: {
      availability: async () => {
        fixture.availabilityCalls += 1;
        return fixture.availability;
      },
      create: async (options?: {
        signal?: AbortSignal;
        monitor?: (monitor: EventTarget) => void;
      }) => {
        fixture.creates += 1;
        const delay = fixture.createDelay;
        const failure = fixture.createFailure;
        const monitor = new EventTarget();
        options?.monitor?.(monitor);
        monitor.dispatchEvent(
          Object.assign(new Event('downloadprogress'), {
            loaded: 0.45,
            total: 1,
          }),
        );
        // Ignore cancellation deliberately so the checked helper/transport must
        // release a session that completes after its original owner has stopped.
        if (delay) await new Promise((done) => setTimeout(done, delay));
        if (failure) throw new Error('Scripted native preparation failed');
        fixture.availability = 'available';
        let destroyed = false;
        return {
          prompt: async () => '',
          promptStreaming(messages: unknown, promptOptions: unknown) {
            fixture.prompts += 1;
            fixture.calls = [
              ...fixture.calls,
              { messages, options: promptOptions },
            ];
            const { output, destination, days, streamDelay } = fixture;
            const text =
              output === 'malformed'
                ? '{"destination":wrong}'
                : output === 'truncated'
                  ? '{"destination":"Lisbon","days":'
                  : JSON.stringify({
                      destination,
                      days: output === 'invalid' ? 99 : days,
                    });
            let cancelled = false;
            return new ReadableStream<string>({
              async start(controller) {
                controller.enqueue(text);
                if (streamDelay)
                  await new Promise((done) => setTimeout(done, streamDelay));
                if (cancelled) return;
                if (output === 'failed')
                  controller.error(
                    new Error('Scripted native generation failed'),
                  );
                else controller.close();
              },
              cancel() {
                cancelled = true;
              },
            });
          },
          destroy() {
            if (destroyed)
              throw new Error('Native fixture session destroyed twice');
            destroyed = true;
            fixture.destroys += 1;
          },
        };
      },
    },
  });
}

/** Restricts native inference recording to explicit local execution. */
export function assertLocalRecordingAllowed(ci: string | undefined): void {
  if (ci && !['false', '0'].includes(ci.trim().toLowerCase()))
    throw new Error('Local model recording must run locally, never in CI');
}

/** Serializes the native fixture for a browser realm without tsx runtime dependencies. */
export function createLocalModelInitScript(
  serializedFixture = installLocalModelShim.toString(),
): string {
  // tsx keepNames inserts __name calls into serialized function bodies.
  // Browser init scripts have no tsx module scope; the naming helper changes
  // metadata only, so a local identity function preserves fixture behavior.
  return `(() => { const __name = (value) => value; (${serializedFixture})(); })();`;
}
