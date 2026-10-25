import type { RunAgentInput } from '@ag-ui/core';
import { expect, type Page } from '@playwright/test';
import type { LightChatbotOutcome } from './docs-light-chatbot-fixtures';

/** Controls only scripted transport replies, leaving application behavior real. */
export interface LightChatbotFixture {
  configure(outcome: LightChatbotOutcome): void;
  requests(): readonly RunAgentInput[];
  settled(): number;
  holdNextTerminal(): () => void;
}
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });
const apply = (page: Page) => button(page, 'Apply brightness');
const status = (page: Page) => page.getByTestId('chat-status');
const complete = 'Reply complete. Review any proposal before applying.';
const prompt = 'Set the desk light to 40%.';
const followup = 'What is the desk light set to now?';

/** Sends a plain user message and binds assertions to its new transport request. */
export async function sendLightMessage(
  page: Page,
  fixture: LightChatbotFixture,
  message = prompt,
  outcome: LightChatbotOutcome = 'success',
): Promise<number> {
  const before = fixture.requests().length;
  fixture.configure(outcome);
  await page.getByLabel('Your message', { exact: true }).fill(message);
  await button(page, 'Send').click();
  await expect.poll(() => fixture.requests().length).toBeGreaterThan(before);
  return before;
}

/** Checks the real canonical tool call/result pair and forwarded trusted UI schema. */
export function verifyLightContinuation(
  requests: readonly RunAgentInput[],
  brightness: number,
  revision: number,
): void {
  expect(requests).toHaveLength(2);
  const [first, next] = requests;
  expect(next.threadId).toBe(first.threadId);
  expect(next.runId).not.toBe(first.runId);
  for (const request of requests) {
    expect(request.tools).toHaveLength(1);
    expect(request.tools[0]).toMatchObject({
      name: 'readLights',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    });
    expect(request.forwardedProps).toMatchObject({
      hashbrown: {
        ui: true,
        responseSchema: {
          type: 'object',
          required: ['ui'],
          properties: { ui: { type: 'array' } },
        },
      },
    });
    const serialized = JSON.stringify(request.forwardedProps);
    expect(serialized).toContain('LightProposal');
    expect(serialized).toContain('LightReading');
    expect(serialized).toContain('lightId');
    expect(serialized).toContain('brightness');
  }
  const toolCallId = `${first.runId}:readLights`;
  expect(next.messages).toContainEqual(
    expect.objectContaining({
      role: 'assistant',
      toolCalls: [
        {
          id: toolCallId,
          type: 'function',
          function: { name: 'readLights', arguments: '{}' },
        },
      ],
    }),
  );
  expect(next.messages).toContainEqual(
    expect.objectContaining({
      role: 'tool',
      toolCallId,
      content: JSON.stringify({
        revision,
        lights: [{ id: 'desk', name: 'Desk light', brightness }],
      }),
    }),
  );
}

/** Retains transient real DOM states without relying on round-trip polling windows. */
async function observeProposal(
  page: Page,
  action: () => Promise<void>,
): Promise<{ status: string; disabled: boolean[]; proposals: number }[]> {
  await page.evaluate(`(() => {
    const snapshots = [];
    const capture = () => snapshots.push({status: document.querySelector('[data-testid="chat-status"]')?.textContent?.trim() ?? '', disabled: [...document.querySelectorAll('button')].filter(button => button.textContent.trim() === 'Apply brightness').map(button => button.disabled), proposals: document.querySelectorAll('[data-testid="proposal-status"]').length});
    const observer = new MutationObserver(capture);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
    capture(); window.__lightObservation = {snapshots,observer};
  })()`);
  try {
    await action();
    return await page.evaluate(`window.__lightObservation.snapshots`);
  } finally {
    await page.evaluate(
      `window.__lightObservation.observer.disconnect(); delete window.__lightObservation;`,
    );
  }
}

/** Verifies tool continuation, action authorization and recovery in either actual SDK. */
export async function verifyLightChatbot(
  page: Page,
  fixture: LightChatbotFixture,
): Promise<void> {
  const initialCount = fixture.requests().length;
  await expect(status(page)).toHaveText('Ready.');
  await expect(page.getByTestId('light-brightness')).toHaveText('80%');
  await page.waitForTimeout(150);
  expect(fixture.requests().length).toBe(initialCount);
  let before = initialCount;
  const snapshots = await observeProposal(page, async () => {
    before = await sendLightMessage(page, fixture);
    await expect(status(page)).toHaveText(complete);
  });
  verifyLightContinuation(fixture.requests().slice(before), 80, 0);
  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.proposals > 0 &&
        snapshot.status === 'Waiting for a reply…' &&
        snapshot.disabled.every(Boolean),
    ),
    JSON.stringify(snapshots),
  ).toBe(true);
  expect(
    snapshots
      .filter((snapshot) => snapshot.status === 'Waiting for a reply…')
      .every((snapshot) => snapshot.disabled.every(Boolean)),
    JSON.stringify(snapshots),
  ).toBe(true);
  await expect(apply(page)).toBeEnabled();
  const count = fixture.requests().length;
  await apply(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('light-brightness')).toHaveText('40%');
  await expect(page.getByTestId('light-revision')).toHaveText('1');
  await expect(apply(page)).toBeDisabled();
  await expect(page.getByTestId('proposal-status')).toHaveText('Applied.');
  expect(fixture.requests().length).toBe(count);
  before = await sendLightMessage(page, fixture, followup);
  await expect(status(page)).toHaveText(complete);
  await expect(page.getByTestId('light-reading')).toHaveText('Desk light: 40%');
  verifyLightContinuation(fixture.requests().slice(before), 40, 1);
  expect(fixture.requests()[before].messages).toContainEqual(
    expect.objectContaining({ role: 'user', content: prompt }),
  );
  expect(fixture.requests()[before].messages).toContainEqual(
    expect.objectContaining({ role: 'user', content: followup }),
  );

  // Fresh state for adverse runs and independent proposals at one revision.
  await page.reload();
  await expect(status(page)).toHaveText('Ready.');
  for (const outcome of [
    'invalid-id',
    'invalid-brightness',
    'truncated',
    'failed',
  ] as const) {
    await page.reload();
    await expect(status(page)).toHaveText('Ready.');
    const adverseSnapshots = await observeProposal(page, async () => {
      await sendLightMessage(page, fixture, prompt, outcome);
      await expect(status(page)).toHaveText(
        outcome === 'failed'
          ? 'The request failed. Send a message to try again.'
          : outcome === 'truncated'
            ? 'Reply incomplete. Send a message to try again.'
            : complete,
      );
    });
    expect(
      adverseSnapshots.some(
        (snapshot) =>
          snapshot.proposals > 0 &&
          snapshot.status === 'Waiting for a reply…' &&
          snapshot.disabled.every(Boolean),
      ),
      JSON.stringify(adverseSnapshots),
    ).toBe(true);
    for (const candidate of await apply(page).all())
      await expect(candidate).toBeDisabled();
    await expect(page.getByTestId('light-brightness')).toHaveText('80%');
    await expect(page.getByTestId('light-revision')).toHaveText('0');
  }
  await page.reload();
  await expect(status(page)).toHaveText('Ready.');
  await sendLightMessage(page, fixture, prompt, 'multiple');
  await expect(status(page)).toHaveText(complete);
  await expect(apply(page)).toHaveCount(2);
  await apply(page).first().click();
  await expect(page.getByTestId('light-brightness')).toHaveText('40%');
  await expect(apply(page).nth(1)).toBeDisabled();
  await expect(page.getByTestId('proposal-status').nth(1)).toHaveText(
    'Unavailable for this run.',
  );
  await expect(page.getByTestId('light-revision')).toHaveText('1');

  // Hold the first UI terminal at the transport boundary. Send replaces that
  // still-active request, and its old delivery resumes only after the new turn.
  await page.reload();
  await expect(status(page)).toHaveText('Ready.');
  const releaseOldTerminal = fixture.holdNextTerminal();
  try {
    await sendLightMessage(page, fixture);
    await expect(apply(page)).toBeVisible();
    await expect(apply(page)).toBeDisabled();
    await expect(status(page)).toHaveText('Waiting for a reply…');
    const replacementStart = await sendLightMessage(page, fixture, followup);
    await expect(status(page)).toHaveText(complete);
    await expect(page.getByTestId('light-reading')).toHaveText(
      'Desk light: 80%',
    );
    verifyLightContinuation(fixture.requests().slice(replacementStart), 80, 0);
    for (const candidate of await apply(page).all())
      await expect(candidate).toBeDisabled();
    const beforeLateDelivery = fixture.settled();
    releaseOldTerminal();
    await expect
      .poll(() => fixture.settled())
      .toBeGreaterThan(beforeLateDelivery);
    await expect(status(page)).toHaveText(complete);
    await expect(page.getByTestId('light-reading')).toHaveText(
      'Desk light: 80%',
    );
    await expect(page.getByTestId('light-brightness')).toHaveText('80%');
    await expect(page.getByTestId('light-revision')).toHaveText('0');
    for (const candidate of await apply(page).all())
      await expect(candidate).toBeDisabled();
  } finally {
    releaseOldTerminal();
  }

  await page.reload();
  await expect(status(page)).toHaveText('Ready.');
  await sendLightMessage(page, fixture);
  await expect(status(page)).toHaveText(complete);
  await expect(apply(page).first()).toBeEnabled();
  await sendLightMessage(page, fixture);
  await expect(apply(page).first()).toBeDisabled();
  await expect(apply(page)).toHaveCount(2);
  await expect(apply(page).last()).toBeDisabled();
  await expect(status(page)).toHaveText('Waiting for a reply…');
  await button(page, 'Stop').click();
  await expect(status(page)).toHaveText(
    'Stopped. Send a message to try again.',
  );
  // Wait for the old HTTP delivery to finish, then prove it did not authorize a card.
  const settled = fixture.settled();
  await expect.poll(() => fixture.settled()).toBeGreaterThan(settled);
  await expect(status(page)).toHaveText(
    'Stopped. Send a message to try again.',
  );
  for (const candidate of await apply(page).all())
    await expect(candidate).toBeDisabled();
  await expect(page.getByTestId('light-brightness')).toHaveText('80%');
  await sendLightMessage(page, fixture);
  await expect(status(page)).toHaveText(complete);
  await expect(apply(page).last()).toBeEnabled();
  await expect(apply(page).first()).toBeDisabled();
  await apply(page).last().click();
  await expect(page.getByTestId('light-brightness')).toHaveText('40%');
  await sendLightMessage(page, fixture, followup);
  await expect(status(page)).toHaveText('Waiting for a reply…');
  await page.evaluate(`window.__unmountLightChatbot()`);
  await expect(page.getByTestId('chat-status')).toHaveCount(0);
  const cleanup = fixture.settled();
  await expect.poll(() => fixture.settled()).toBeGreaterThan(cleanup);
  await expect(page.getByTestId('chat-status')).toHaveCount(0);
}

/** Captures the readable conversation on the actual checked framework component. */
export async function demonstrateLightChatbot(
  page: Page,
  fixture: LightChatbotFixture,
  phase: (text: string) => void = () => undefined,
): Promise<void> {
  phase('Send. The browser tool reads 80%.');
  const before = await sendLightMessage(page, fixture);
  await expect(apply(page)).toBeVisible();
  await expect(apply(page)).toBeDisabled();
  phase('A trusted proposal streams.');
  await expect(status(page)).toHaveText(complete);
  await expect(apply(page)).toBeEnabled();
  verifyLightContinuation(fixture.requests().slice(before), 80, 0);
  await page.waitForTimeout(1200);
  phase('Apply: local brightness becomes 40%.');
  await apply(page).click();
  await expect(page.getByTestId('light-brightness')).toHaveText('40%');
  await expect(apply(page)).toBeDisabled();
  await page.waitForTimeout(1400);
  phase('Ask again. The tool reads 40%.');
  const followupStart = await sendLightMessage(page, fixture, followup);
  await expect(status(page)).toHaveText(complete);
  await expect(page.getByTestId('light-reading')).toHaveText('Desk light: 40%');
  verifyLightContinuation(fixture.requests().slice(followupStart), 40, 1);
  phase('LightReading shows updated state.');
}
