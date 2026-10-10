// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { applyFollow, applySnapshot, INITIAL_STATE } from '../store';
import { createFollowPill, followPillView, RESUME_MS } from './follow-pill';

const plane = { hex: 'a1b2c3', label: 'UAL1802' } as unknown as Aircraft;
const live = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

test('followPillView names the followed plane with a Stop action', () => {
  const view = followPillView(applyFollow(live, 'A1B2C3'), null, 0);

  expect(view).toEqual({
    text: 'Following UAL1802',
    action: 'stop',
    button: 'Stop',
    hex: 'a1b2c3',
  });
});

test('after a drag ends the follow, the pill offers to resume for a few seconds', () => {
  const resume = { hex: 'a1b2c3', until: RESUME_MS };

  const views = [
    followPillView(live, resume, 0),
    followPillView(live, resume, RESUME_MS),
    followPillView(INITIAL_STATE, resume, 0),
    followPillView(live, null, 0),
  ];

  expect(views).toEqual([
    {
      text: 'Stopped following UAL1802',
      action: 'resume',
      button: 'Resume',
      hex: 'a1b2c3',
    },
    null,
    null,
    null,
  ]);
});

test('createFollowPill shows the view as text and reports its button', () => {
  const pressed: string[] = [];
  const pill = createFollowPill(document, (view) => pressed.push(view.action));

  pill.show(followPillView(applyFollow(live, 'a1b2c3'), null, 0));
  const shown = pill.element.classList.contains('is-open');
  pill.element.querySelector('button')?.click();
  pill.show(null);

  expect(shown).toBe(true);
  expect(pill.element.getAttribute('data-testid')).toBe('follow-pill');
  expect(pressed).toEqual(['stop']);
  expect(pill.element.classList.contains('is-open')).toBe(false);
});

test('createFollowPill rebuilds only when the view changes', () => {
  const pill = createFollowPill(document, () => undefined);
  const view = followPillView(applyFollow(live, 'a1b2c3'), null, 0);
  pill.show(view);
  const first = pill.element.firstChild;

  pill.show(followPillView(applyFollow(live, 'a1b2c3'), null, 5));

  expect(pill.element.firstChild).toBe(first);
  expect(pill.element.textContent).toBe('Following UAL1802Stop');
});
