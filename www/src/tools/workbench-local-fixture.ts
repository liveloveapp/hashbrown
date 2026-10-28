/** Installs a clearly labelled native API contract fixture; published footage never uses this. */
export function installWorkbenchLocalFixture(
  runtime: Record<string, unknown> = globalThis as unknown as Record<
    string,
    unknown
  >,
) {
  const fixture = {
    availability: 'available',
    creates: 0,
    destroys: 0,
    prompts: 0,
    availabilityCalls: 0,
    createDelay: 0,
    streamDelay: 80,
    createFailure: false,
    output: 'valid',
    calls: [] as unknown[],
  };
  runtime['__workbenchLocalFixture'] = fixture;
  Object.defineProperty(runtime, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => {
        fixture.availabilityCalls++;
        return fixture.availability;
      },
      create: async (options?: { monitor?: (target: EventTarget) => void }) => {
        fixture.creates++;
        const monitor = new EventTarget();
        options?.monitor?.(monitor);
        monitor.dispatchEvent(
          Object.assign(new Event('downloadprogress'), {
            loaded: 0.45,
            total: 1,
          }),
        );
        if (fixture.createDelay)
          await new Promise((resolve) =>
            setTimeout(resolve, fixture.createDelay),
          );
        if (fixture.createFailure)
          throw new Error('Native API fixture preparation failure');
        fixture.availability = 'available';
        let destroyed = false;
        return {
          promptStreaming(messages: unknown, options: unknown) {
            fixture.prompts++;
            fixture.calls.push({ messages, options });
            const history = messages as { role: string; content: unknown }[];
            const latest = [...history]
              .reverse()
              .find((message) => message.role === 'user');
            const second = String(latest?.content).includes('shorter');
            const { output, streamDelay } = fixture;
            const plan = {
              title: 'Show how a model renders trusted UI',
              steps: [
                'Outline the trusted UI demo.',
                second
                  ? 'Record a demo.'
                  : 'Record a short demo of the generated interface.',
              ],
            };
            const text =
              output === 'malformed'
                ? '{"title":wrong}'
                : output === 'truncated'
                  ? '{"title":"A plan","steps":["Outline",'
                  : JSON.stringify(
                      output === 'invalid'
                        ? { ...plan, steps: [] }
                        : output === 'extra'
                          ? { ...plan, extra: true }
                          : plan,
                    );
            let cancelled = false;
            return new ReadableStream<string>({
              async start(controller) {
                for (let index = 0; index < text.length; index += 16) {
                  if (cancelled) return;
                  controller.enqueue(text.slice(index, index + 16));
                  if (streamDelay)
                    await new Promise((resolve) =>
                      setTimeout(resolve, streamDelay),
                    );
                }
                if (cancelled) return;
                if (output === 'failed')
                  controller.error(
                    new Error('Native API fixture stream failure'),
                  );
                else controller.close();
              },
              cancel() {
                cancelled = true;
              },
            });
          },
          destroy() {
            if (!destroyed) {
              destroyed = true;
              fixture.destroys++;
            }
          },
        };
      },
    },
  });
}

/** Serializes only the self-contained test model into its own browser realm. */
export function workbenchLocalFixtureScript() {
  return `(()=>{const __name=value=>value;(${installWorkbenchLocalFixture.toString()})();document.addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('p');badge.textContent='Native API fixture · not real inference';badge.style.cssText='position:fixed;right:12px;bottom:100px;z-index:999;background:#fff;padding:8px';document.body.append(badge);});})();`;
}
