import { type AGUIEvent, EventType } from '@ag-ui/core';
import { expect, type Page, test } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import { installBrowserHygiene } from '../harness/browser';
import { createEventGate } from '../harness/event-gate';
import { startIndependentEndpoint } from '../harness/independent-endpoint';

/** Rejects browser errors while allowing the runtime to close accepted terminal responses. */
function inspectEndpointBrowser(
  page: Page,
  endpoint: Awaited<ReturnType<typeof startIndependentEndpoint>>,
) {
  return installBrowserHygiene(page, {}, (request) => {
    if (
      request.method() !== 'POST' ||
      request.url() !== endpoint.url ||
      request.failure()?.errorText !== 'net::ERR_ABORTED'
    )
      return false;
    const input = request.postDataJSON() as { runId?: unknown };
    return (
      typeof input.runId === 'string' &&
      endpoint.consumeTerminalRun(input.runId)
    );
  });
}

test('resumes a complete committed batch without executing historical tools', async ({
  page,
}) => {
  const gate = createEventGate();
  let requestCount = 0;
  const endpoint = await startIndependentEndpoint({
    beforeEvent: (index, signal) =>
      requestCount === 2 ? gate.wait(index, signal) : Promise.resolve(),
    events: (input): AGUIEvent[] => {
      requestCount += 1;
      const started: AGUIEvent = {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      };
      const finished = {
        type: EventType.RUN_FINISHED as const,
        threadId: input.threadId,
        runId: input.runId,
      };
      if (!input.resume) {
        return [
          started,
          { type: EventType.STATE_SNAPSHOT, snapshot: { approved: false } },
          {
            type: EventType.MESSAGES_SNAPSHOT,
            messages: [
              ...input.messages,
              {
                id: 'proposal',
                role: 'assistant',
                toolCalls: [
                  {
                    id: 'weather',
                    type: 'function',
                    function: {
                      name: 'getWeather',
                      arguments: '{"city":"Paris"}',
                    },
                  },
                ],
              },
            ],
          },
          {
            ...finished,
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'approval',
                  reason: 'tool_call',
                  toolCallId: 'weather',
                  message: 'Approve weather lookup?',
                },
                { id: 'confirm', reason: 'confirmation', message: 'Confirm?' },
              ],
            },
          },
        ];
      }
      return [
        started,
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'weather-result',
          toolCallId: 'weather',
          content: '{"temperatureC":21}',
          role: 'tool',
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'answer',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'answer',
          delta: 'Resumed',
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'answer' },
        finished,
      ];
    },
  });
  const driver = createAppDriver(page);

  const hygiene = inspectEndpointBrowser(page, endpoint);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: endpoint.url, scenario: 'tool', retries: '0' })}`,
    );
    await expect(page.getByTestId('fixture-ready')).toBeVisible();
    await driver.send('Check weather');

    await expect(page.getByTestId('interrupt-count')).toHaveText('2');
    await expect(page.getByTestId('interrupt-message')).toHaveText([
      'Approve weather lookup?',
      'Confirm?',
    ]);
    await driver.expectIdle();
    await expect(driver.toolCount()).toHaveText('0');
    await expect(page.getByTestId('shared-state')).toHaveText(
      '{"approved":false}',
    );
    const batchId = await page.getByTestId('interrupt-batch-id').innerText();
    expect(batchId).not.toBe('');
    await page.getByTestId('resume').click();

    await expect.poll(() => endpoint.inputs.length).toBe(2);
    await expect(page.getByTestId('is-resuming')).toHaveText('true');
    await expect(page.getByTestId('interrupt-batch-id')).toHaveText(batchId);
    await expect(page.getByTestId('resume')).toBeDisabled();
    const [initial, resumed] = endpoint.inputs;
    expect(resumed.threadId).toBe(initial.threadId);
    expect(resumed.runId).not.toBe(initial.runId);
    expect(resumed.state).toEqual({ approved: false });
    expect(resumed.resume).toEqual([
      {
        interruptId: 'approval',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'confirm',
        status: 'resolved',
        payload: { approved: true },
      },
    ]);
    expect(resumed).not.toHaveProperty('batchId');
    expect(resumed.messages).toEqual([
      ...initial.messages,
      {
        id: 'proposal',
        role: 'assistant',
        toolCalls: [
          {
            id: 'weather',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"city":"Paris"}' },
          },
        ],
      },
    ]);

    gate.releaseThrough(0);
    await expect(page.getByTestId('interrupt-count')).toHaveText('0');
    await expect(page.getByTestId('is-resuming')).toHaveText('true');
    gate.releaseThrough(20);

    await expect(driver.assistant()).toHaveText('Resumed');
    await driver.expectIdle();
    await expect(page.getByTestId('is-resuming')).toHaveText('false');
    await expect(driver.toolCount()).toHaveText('0');
    await expect(driver.error()).toBeEmpty();
    expect(endpoint.inputs).toHaveLength(2);
    await hygiene.assertClean();
  } finally {
    gate.releaseThrough(20);
    await endpoint.stop();
  }
});

test('publishes a fresh batch identity when the server interrupts again', async ({
  page,
}) => {
  const endpoint = await startIndependentEndpoint({
    events: (input) => [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: {
          type: 'interrupt',
          interrupts: [{ id: 'same-id', reason: 'input_required' }],
        },
      },
    ],
  });
  const driver = createAppDriver(page);

  const hygiene = inspectEndpointBrowser(page, endpoint);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: endpoint.url, retries: '0' })}`,
    );
    await expect(page.getByTestId('fixture-ready')).toBeVisible();
    await driver.send('Begin');
    await expect(page.getByTestId('interrupt-count')).toHaveText('1');
    const firstBatchId = await page
      .getByTestId('interrupt-batch-id')
      .innerText();

    await page.getByTestId('resume').click();

    await expect.poll(() => endpoint.inputs.length).toBe(2);
    await expect(page.getByTestId('interrupt-batch-id')).not.toHaveText(
      firstBatchId,
    );
    await expect(page.getByTestId('interrupt-count')).toHaveText('1');
    await expect(page.getByTestId('is-resuming')).toHaveText('false');
    await expect(page.getByTestId('resume')).toBeEnabled();
    await driver.expectIdle();
    expect(endpoint.inputs[1].resume).toEqual([
      {
        interruptId: 'same-id',
        status: 'resolved',
        payload: { approved: true },
      },
    ]);
    await hygiene.assertClean();
  } finally {
    await endpoint.stop();
  }
});

test('keeps an expired batch visible and refuses to send its answers', async ({
  page,
}) => {
  const endpoint = await startIndependentEndpoint({
    events: (input) => [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'expired',
              reason: 'input_required',
              expiresAt: '2000-01-01T00:00:00Z',
            },
          ],
        },
      },
    ],
  });
  const driver = createAppDriver(page);

  const hygiene = inspectEndpointBrowser(page, endpoint);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: endpoint.url, retries: '0' })}`,
    );
    await expect(page.getByTestId('fixture-ready')).toBeVisible();
    await driver.send('Begin');
    await expect(page.getByTestId('interrupt-count')).toHaveText('1');
    const batchId = await page.getByTestId('interrupt-batch-id').innerText();

    await page.getByTestId('resume').click();

    await expect(page.getByTestId('resume-error')).toContainText('expired');
    await expect(page.getByTestId('interrupt-batch-id')).toHaveText(batchId);
    await expect(page.getByTestId('is-resuming')).toHaveText('false');
    await driver.expectIdle();
    expect(endpoint.inputs).toHaveLength(1);
    await hygiene.assertClean();
  } finally {
    await endpoint.stop();
  }
});

for (const acknowledged of [false, true]) {
  test(`stop ${acknowledged ? 'after' : 'before'} resume acknowledgement ${acknowledged ? 'requires a new thread' : 'releases the same batch'}`, async ({
    page,
  }) => {
    const gate = createEventGate();
    let requestCount = 0;
    const endpoint = await startIndependentEndpoint({
      beforeEvent: (index, signal) =>
        requestCount === 2 ? gate.wait(index, signal) : Promise.resolve(),
      events: (input) => {
        requestCount += 1;
        return [
          {
            type: EventType.RUN_STARTED,
            threadId: input.threadId,
            runId: input.runId,
          },
          {
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
            ...(!input.resume
              ? {
                  outcome: {
                    type: 'interrupt' as const,
                    interrupts: [{ id: 'approval', reason: 'input_required' }],
                  },
                }
              : {}),
          },
        ];
      },
    });
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: endpoint.url, retries: '0' })}`,
      );
      await expect(page.getByTestId('fixture-ready')).toBeVisible();
      await driver.send('Begin');
      await expect(page.getByTestId('interrupt-count')).toHaveText('1');
      const batchId = await page.getByTestId('interrupt-batch-id').innerText();
      await page.getByTestId('resume').click();
      await expect.poll(() => endpoint.inputs.length).toBe(2);
      if (acknowledged) {
        gate.releaseThrough(0);
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
      }

      await driver.stop();

      await driver.expectIdle();
      await expect(page.getByTestId('is-resuming')).toHaveText('false');
      if (acknowledged) {
        await driver.send('Blocked');
        await expect(page.getByTestId('command-error')).toContainText(
          /thread/i,
        );
        expect(endpoint.inputs).toHaveLength(2);
        await page.getByTestId('new-thread').click();
        await driver.send('New workflow');
        await expect.poll(() => endpoint.inputs.length).toBe(3);
        expect(endpoint.inputs[2].threadId).not.toBe(
          endpoint.inputs[0].threadId,
        );
        expect(endpoint.inputs[2].resume).toBeUndefined();
      } else {
        await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
          batchId,
        );
        await expect(page.getByTestId('resume')).toBeEnabled();
        await page.getByTestId('resume').click();
        await expect.poll(() => endpoint.inputs.length).toBe(3);
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(page.getByTestId('is-resuming')).toHaveText('false');
        expect(endpoint.inputs[2].threadId).toBe(endpoint.inputs[0].threadId);
        expect(endpoint.inputs[2].resume).toEqual(endpoint.inputs[1].resume);
      }
    } finally {
      gate.releaseThrough(20);
      await endpoint.stop();
    }
  });
}

test('pauses incomplete structured output without a finalization error', async ({
  page,
}) => {
  const endpoint = await startIndependentEndpoint({
    extended: true,
    events: (input) => [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: input.resume ? 'final' : 'partial',
        role: 'assistant',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: input.resume ? 'final' : 'partial',
        delta: input.resume
          ? '{"answer":"Complete","count":1}'
          : '{"answer":"Need approval"',
      },
      ...(input.resume
        ? [{ type: EventType.TEXT_MESSAGE_END as const, messageId: 'final' }]
        : []),
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        ...(!input.resume
          ? {
              outcome: {
                type: 'interrupt' as const,
                interrupts: [{ id: 'approval', reason: 'input_required' }],
              },
            }
          : {}),
      },
    ],
  });
  const driver = createAppDriver(page);

  const hygiene = inspectEndpointBrowser(page, endpoint);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: endpoint.url, scenario: 'structured', retries: '0' })}`,
    );
    await expect(page.getByTestId('fixture-ready')).toBeVisible();
    await driver.send('Begin');
    await expect(page.getByTestId('interrupt-count')).toHaveText('1');
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();

    await page.getByTestId('resume').click();

    await expect(page.getByTestId('structured-answer')).toHaveText('Complete');
    await expect(page.getByTestId('structured-count')).toHaveText('1');
    await expect(page.getByTestId('interrupt-count')).toHaveText('0');
    await expect(page.getByTestId('is-resuming')).toHaveText('false');
    await driver.expectIdle();
    await expect(driver.error()).toBeEmpty();
    expect(endpoint.inputs).toHaveLength(2);
    expect(endpoint.inputs[1].hashbrown?.responseSchema).toEqual(
      endpoint.inputs[0].hashbrown?.responseSchema,
    );
    await hygiene.assertClean();
  } finally {
    await endpoint.stop();
  }
});

for (const acknowledged of [false, true]) {
  test(`failure ${acknowledged ? 'after' : 'before'} resume acknowledgement preserves the correct ownership`, async ({
    page,
  }) => {
    let requestCount = 0;
    const endpoint = await startIndependentEndpoint({
      events: (input) => {
        requestCount += 1;
        const started = {
          type: EventType.RUN_STARTED as const,
          threadId: input.threadId,
          runId: input.runId,
        };
        if (requestCount === 2) {
          return acknowledged
            ? [
                started,
                {
                  type: EventType.RUN_ERROR,
                  message: 'Resume failed',
                  code: 'FIXTURE_FAILURE',
                },
              ]
            : [];
        }
        return [
          started,
          {
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
            outcome: {
              type: 'interrupt',
              interrupts: [{ id: 'approval', reason: 'input_required' }],
            },
          },
        ];
      },
    });
    const driver = createAppDriver(page);

    try {
      await page.goto(
        `/?${new URLSearchParams({ runUrl: endpoint.url, retries: '0' })}`,
      );
      await expect(page.getByTestId('fixture-ready')).toBeVisible();
      await driver.send('Begin');
      await expect(page.getByTestId('interrupt-count')).toHaveText('1');
      const batchId = await page.getByTestId('interrupt-batch-id').innerText();

      await page.getByTestId('resume').click();

      await expect.poll(() => endpoint.inputs.length).toBe(2);
      await expect(driver.error()).not.toBeEmpty();
      await driver.expectIdle();
      await expect(page.getByTestId('is-resuming')).toHaveText('false');
      if (acknowledged) {
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await driver.send('Blocked');
        await expect(page.getByTestId('command-error')).toContainText(
          /thread/i,
        );
        expect(endpoint.inputs).toHaveLength(2);
        await page.getByTestId('new-thread').click();
        await driver.send('New workflow');
        await expect.poll(() => endpoint.inputs.length).toBe(3);
        expect(endpoint.inputs[2].threadId).not.toBe(
          endpoint.inputs[0].threadId,
        );
        expect(endpoint.inputs[2].resume).toBeUndefined();
      } else {
        await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
          batchId,
        );
        await expect(page.getByTestId('resume')).toBeEnabled();
        await page.getByTestId('resume').click();
        await expect.poll(() => endpoint.inputs.length).toBe(3);
        expect(endpoint.inputs[2].resume).toEqual(endpoint.inputs[1].resume);
      }
    } finally {
      await endpoint.stop();
    }
  });
}

test('defers completion input until the resumed tool follow-up succeeds', async ({
  page,
}) => {
  const gate = createEventGate();
  let requestCount = 0;
  const endpoint = await startIndependentEndpoint({
    extended: true,
    beforeEvent: (index, signal) =>
      requestCount === 3 ? gate.wait(index, signal) : Promise.resolve(),
    events: (input) => {
      requestCount += 1;
      const started = {
        type: EventType.RUN_STARTED as const,
        threadId: input.threadId,
        runId: input.runId,
      };
      const finished = {
        type: EventType.RUN_FINISHED as const,
        threadId: input.threadId,
        runId: input.runId,
      };
      if (requestCount === 1) {
        return [
          started,
          {
            ...finished,
            outcome: {
              type: 'interrupt',
              interrupts: [{ id: 'approval', reason: 'input_required' }],
            },
          },
        ];
      }
      if (input.resume) {
        return [
          started,
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'new-weather',
            toolCallName: 'getWeather',
            parentMessageId: 'new-proposal',
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'new-weather',
            delta: '{"city":"Paris"}',
          },
          { type: EventType.TOOL_CALL_END, toolCallId: 'new-weather' },
          finished,
        ];
      }
      return [
        started,
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `answer-${requestCount}`,
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `answer-${requestCount}`,
          delta: JSON.stringify({
            answer: requestCount === 3 ? 'Completed A' : 'Completed C',
            count: 1,
          }),
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `answer-${requestCount}`,
        },
        finished,
      ];
    },
  });

  const hygiene = inspectEndpointBrowser(page, endpoint);

  try {
    await page.goto(
      `/?${new URLSearchParams({ runUrl: endpoint.url, scenario: 'completion', retries: '0' })}`,
    );
    await expect(page.getByTestId('fixture-ready')).toBeVisible();
    await page.getByTestId('completion-input').fill('A');
    await expect(page.getByTestId('interrupt-count')).toHaveText('1');
    await page.getByTestId('completion-input').fill('B');
    await page.getByTestId('completion-input').fill('C');

    await page.getByTestId('resume').click();

    await expect.poll(() => endpoint.inputs.length).toBe(3);
    await expect(page.getByTestId('tool-count')).toHaveText('1');
    await expect(page.getByTestId('is-resuming')).toHaveText('true');
    expect(endpoint.inputs[1].messages).toEqual(endpoint.inputs[0].messages);
    expect(endpoint.inputs[2].resume).toBeUndefined();
    expect(
      endpoint.inputs[2].messages.some(
        (message) =>
          message.role === 'tool' && message.toolCallId === 'new-weather',
      ),
    ).toBe(true);
    gate.releaseThrough(20);

    await expect.poll(() => endpoint.inputs.length).toBe(4);
    await expect(page.getByTestId('structured-answer')).toHaveText(
      'Completed C',
    );
    await expect(page.getByTestId('is-resuming')).toHaveText('false');
    await expect(page.getByTestId('error')).toBeEmpty();
    expect(endpoint.inputs[3].resume).toBeUndefined();
    expect(
      endpoint.inputs[3].messages.filter((message) => message.role === 'user'),
    ).toEqual([expect.objectContaining({ role: 'user', content: 'C' })]);
    expect(
      endpoint.inputs
        .flatMap((input) => input.messages)
        .some((message) => message.role === 'user' && message.content === 'B'),
    ).toBe(false);
    await hygiene.assertClean();
  } finally {
    gate.releaseThrough(20);
    await endpoint.stop();
  }
});
