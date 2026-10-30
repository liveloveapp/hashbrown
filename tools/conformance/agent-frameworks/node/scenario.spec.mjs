import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScenario } from './scenario.mjs';

const options = {
  live: true,
  framework: 'unit',
  profile: 'unit',
  versions: {},
  transport: 'unit test',
};

test('host reports a bridge error before actual tool execution', async () => {
  const makeAgent = async () => ({
    run: () => ({
      subscribe(observer) {
        observer.error(new Error('native model failed'));
        return {
          unsubscribe() {
            return undefined;
          },
        };
      },
    }),
  });

  await assert.rejects(
    captureScenario(makeAgent, options),
    /native model failed/,
  );
});

test('host reports a bridge error while waiting for live tool START', async () => {
  const makeAgent = async (execute) => ({
    run: () => ({
      subscribe(observer) {
        void execute({ city: 'Paris' });
        queueMicrotask(() => observer.error(new Error('native stream failed')));
        return {
          unsubscribe() {
            return undefined;
          },
        };
      },
    }),
  });

  await assert.rejects(
    captureScenario(makeAgent, options),
    /native stream failed/,
  );
});
