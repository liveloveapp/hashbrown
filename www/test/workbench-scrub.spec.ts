// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { attachWorkbenchScrub } from '../examples/quickstart/runtime/workbench-scrub';

const setup = (options: { disabled?: boolean } = {}) => {
  const track = document.createElement('div');
  const tick = document.createElement('button');
  tick.dataset['index'] = '3';
  track.append(tick);
  document.body.append(track);
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 200,
    width: 100,
    top: 0,
    bottom: 10,
    height: 10,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  const onScrub = vi.fn();
  const detach = attachWorkbenchScrub({
    track,
    indexAt: (fraction) => Math.round(fraction * 10),
    onScrub,
    isDisabled: () => options.disabled === true,
    tickSelector: '[data-index]',
  });
  const fire = (
    target: HTMLElement,
    type: string,
    clientX = 0,
    pointerId = 1,
  ) =>
    target.dispatchEvent(
      Object.assign(new MouseEvent(type, { clientX, bubbles: true }), {
        pointerId,
      }),
    );
  return { track, tick, onScrub, detach, fire };
};

test('scrubs on press and follows the pointer', () => {
  const { track, onScrub, fire } = setup();

  fire(track, 'pointerdown', 120);
  fire(track, 'pointermove', 120);
  fire(track, 'pointermove', 160);
  fire(track, 'pointerup', 160);
  fire(track, 'pointermove', 190);

  expect(onScrub.mock.calls).toEqual([[2], [6]]);
});

test('treats a still press on a tick as a click, not a scrub', () => {
  const { tick, onScrub, fire } = setup();

  fire(tick, 'pointerdown', 150);
  fire(tick, 'pointermove', 153);
  fire(tick, 'pointerup', 153);

  expect(onScrub).not.toHaveBeenCalled();
});

test('turns a press on a tick into a scrub after 4px', () => {
  const { tick, track, onScrub, fire } = setup();

  fire(tick, 'pointerdown', 150);
  fire(track, 'pointermove', 156);
  fire(track, 'pointermove', 170);

  expect(onScrub.mock.calls).toEqual([[6], [7]]);
});

test('ignores other pointers', () => {
  const { track, onScrub, fire } = setup();

  fire(track, 'pointerdown', 120, 1);
  fire(track, 'pointermove', 180, 2);
  fire(track, 'pointerup', 180, 2);
  fire(track, 'pointermove', 150, 1);

  expect(onScrub.mock.calls).toEqual([[2], [5]]);
});

test('stops after lostpointercapture', () => {
  const { track, onScrub, fire } = setup();

  fire(track, 'pointerdown', 120);
  fire(track, 'lostpointercapture', 120);
  fire(track, 'pointermove', 180);

  expect(onScrub.mock.calls).toEqual([[2]]);
});

test('ignores presses while disabled', () => {
  const { track, onScrub, fire } = setup({ disabled: true });

  fire(track, 'pointerdown', 120);
  fire(track, 'pointermove', 180);

  expect(onScrub).not.toHaveBeenCalled();
});

test('detach removes listeners', () => {
  const { track, onScrub, detach, fire } = setup();

  detach();
  fire(track, 'pointerdown', 120);

  expect(onScrub).not.toHaveBeenCalled();
});
