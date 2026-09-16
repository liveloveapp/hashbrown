import { createEventGate } from './event-gate';

test('holds events until their index is explicitly released', async () => {
  const gate = createEventGate();
  const signal = new AbortController().signal;
  let delivered = false;
  const waiting = gate.wait(2, signal).then(() => {
    delivered = true;
  });

  gate.releaseThrough(1);
  await Promise.resolve();

  expect(delivered).toBe(false);
  gate.releaseThrough(2);
  await waiting;
  expect(delivered).toBe(true);
  gate.releaseThrough(0);
  await gate.wait(2, signal);
});

test('aborting a gate rejects pending and future waits', async () => {
  const gate = createEventGate();
  const controller = new AbortController();
  const waiting = gate.wait(0, controller.signal);
  const rejected = expect(waiting).rejects.toThrow('aborted');

  controller.abort();

  await rejected;
  await expect(gate.wait(0, controller.signal)).rejects.toThrow('aborted');
});

test('unreleased gates time out instead of leaking pending work', async () => {
  const gate = createEventGate(10);

  const waiting = gate.wait(0, new AbortController().signal);

  await expect(waiting).rejects.toThrow('Timed out waiting for event 0');
});
