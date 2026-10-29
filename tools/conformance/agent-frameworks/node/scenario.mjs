import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { captureEvents } from '../harness/capture.mjs';

/** Deterministic successful return value from each framework's actual weather tool. */
export const weatherResult = 'Paris: 21°C and sunny';
/** Deterministic assistant text generated after consuming the actual weather result. */
export const answerText = 'The weather in Paris is 21°C and sunny.';

/** Reads exact installed versions without trusting the requested manifest range. */
export function installedVersions(names) {
  const require = createRequire(import.meta.url);
  return Object.fromEntries(
    names.map((name) => {
      let path = require.resolve(name);
      while (path.includes('/') && !path.endsWith('/node_modules')) {
        path = path.slice(0, path.lastIndexOf('/'));
        try {
          const manifest = JSON.parse(
            readFileSync(`${path}/package.json`, 'utf8'),
          );
          if (manifest.name === name) return [name, manifest.version];
        } catch {
          /* Continue to the owning package manifest. */
        }
      }
      throw new Error(`No installed manifest for ${name}`);
    }),
  );
}

/** Captures the published bridge while an actual tool is blocked on a completion gate. */
export async function captureScenario(
  makeAgent,
  { live, framework, profile, versions, transport, outcome = 'success' },
) {
  let release;
  let entered;
  let started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const toolEntered = new Promise((resolve) => {
    entered = resolve;
  });
  const callStarted = new Promise((resolve) => {
    started = resolve;
  });
  let toolCompleted = false;
  let toolAbortObserved = false;
  let toolExecutions = 0;
  let startBeforeToolCompletion = false;
  const execute = async ({ city }, { signal } = {}) => {
    assert.equal(city, 'Paris');
    toolExecutions += 1;
    entered();
    await new Promise((resolve, reject) => {
      const aborted = () => {
        toolAbortObserved = true;
        reject(new Error('Weather tool cancelled'));
      };
      if (signal?.aborted) aborted();
      else {
        signal?.addEventListener('abort', aborted, { once: true });
        gate.then(() => {
          signal?.removeEventListener('abort', aborted);
          resolve();
        });
      }
    });
    toolCompleted = true;
    if (outcome === 'failure') throw new Error('Weather service unavailable');
    return weatherResult;
  };
  const agent = await makeAgent(execute);
  const input = {
    threadId: `${framework}-${profile}-thread`,
    runId: `${framework}-${profile}-run`,
    messages: [
      {
        id: 'question',
        role: 'user',
        content: 'What is the weather in Paris?',
      },
    ],
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
  };
  const capture = captureEvents(agent.run(input), {
    onEvent(event) {
      if (event.type === 'TOOL_CALL_START') {
        startBeforeToolCompletion = !toolCompleted;
        started();
      }
    },
  });
  const endedBeforeGate = capture.then(() => {
    throw new Error('Framework ended before completing the timing gate');
  });
  let timeout;
  let timingError;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new Error('Actual framework tool did not reach the timing gate'),
        ),
      8_000,
    );
  });
  try {
    await Promise.race([toolEntered, endedBeforeGate, deadline]);
    if (live) await Promise.race([callStarted, endedBeforeGate, deadline]);
    else await new Promise((resolve) => setImmediate(resolve));
    assert.equal(startBeforeToolCompletion, live);
    if (outcome === 'cancel') agent.abortRun();
  } catch (error) {
    timingError = error;
  } finally {
    release();
    clearTimeout(timeout);
  }
  let events;
  try {
    events = await capture;
  } catch (error) {
    throw timingError ?? error;
  }
  if (timingError) throw timingError;
  return {
    framework,
    profile,
    versions,
    events,
    expected: {
      calls: [
        { name: 'getWeather', args: { city: 'Paris' }, result: weatherResult },
      ],
      text: answerText,
    },
    evidence: {
      realFrameworkExecution: true,
      transport,
      toolExecutions,
      toolCompleted,
      toolAbortObserved,
      outcome,
      startBeforeToolCompletion,
      nativeCheckpointRestore: 'not-tested',
    },
  };
}
