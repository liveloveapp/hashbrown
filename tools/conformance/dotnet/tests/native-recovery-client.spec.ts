/* eslint-disable @nx/enforce-module-boundaries -- Tests real host app recovery clients, which have no public library entry point. */
import { createChatRuntime } from '../../../../packages/core/src/chat-runtime';
import { s } from '../../../../packages/core/src/schema';
import type { ConversationSnapshot } from '../../../../packages/core/src/models/conversation-recovery';
import * as react from '../../hosts/react/src/recovery';
import * as angular from '../../hosts/angular/src/recovery';

for (const [framework, recovery] of Object.entries({ react, angular })) {
  test(`${framework} recognizes pending native browser work without permitting recovery execution`, () => {
    const input = {
      schemaVersion: 1,
      disposition: 'NativePendingBrowserResults',
      snapshot: { messages: [] },
    };

    const result = recovery.readRecovery(input);

    expect(recovery.recoveryBlocked(result)).toBe(true);
    expect(result.snapshot).toBeUndefined();
  });

  test(`${framework} blocks a mixed pending native batch even when an unexpected snapshot is supplied`, () => {
    const input = {
      schemaVersion: 1,
      disposition: 'Pending',
      reason: 'PendingMixedBrowserResult',
      batchId: 'unexpected-local-token',
      snapshot: {
        threadId: 'thread',
        messages: [],
        interrupts: [{ id: 'unexpected' }],
      },
    };

    const result = recovery.readRecovery(input);

    expect(recovery.recoveryBlocked(result)).toBe(true);
    expect(result.snapshot).toBeUndefined();
    expect(recovery.recoveryStatus(result)).toContain('Start a new thread');
  });

  test(`${framework} rejects unknown or inconsistent pending recovery reasons`, () => {
    for (const input of [
      { schemaVersion: 1, disposition: 'Pending', reason: 'unknown' },
      {
        schemaVersion: 1,
        disposition: 'Completed',
        reason: 'PendingMixedBrowserResult',
      },
      { schemaVersion: 1, disposition: 'Pending', reason: 1 },
      { schemaVersion: 1, disposition: 'Pending', reason: 'x'.repeat(1025) },
    ]) {
      expect(() => recovery.readRecovery(input)).toThrow(
        'Unsupported recovery envelope',
      );
    }
  });

  test(`${framework} preserves native-only pending snapshots for the SDK restoration guard`, () => {
    const snapshot = {
      threadId: 'thread',
      messages: [],
      interrupts: [
        {
          id: 'ficc_call',
          reason: 'tool_call',
          message: 'Approval required for tool call: backend',
          toolCallId: 'call',
          responseSchema: {
            type: 'object',
            properties: { approved: { type: 'boolean' } },
            required: ['approved'],
          },
        },
      ],
    };

    const result = recovery.readRecovery({
      schemaVersion: 1,
      disposition: 'Pending',
      serverRevision: 5,
      snapshot,
    });

    expect(result.snapshot).toEqual(snapshot);
    expect(recovery.recoveryBlocked(result)).toBe(false);
  });

  for (const [variant, metadata] of [
    ['raw', undefined],
    [
      'sdk',
      {
        'b4.step': { v: 1, kind: 'server', status: 'cancelled', settledAt: 1 },
      },
    ],
    ['untimed', { 'b4.step': { v: 1, kind: 'server', status: 'cancelled' } }],
    [
      'server-time',
      {
        'b4.step': {
          v: 1,
          kind: 'server',
          status: 'cancelled',
          settledAt: 1700000000000,
        },
      },
    ],
  ] as const) {
    test(`${framework} retains the SDK unresolved browser restoration guard for ${variant}`, () => {
      const handler = jest.fn(async () => 'browser-result');
      const runtime = createChatRuntime({
        system: '',
        tools: [
          {
            name: 'frontend',
            description: 'browser',
            schema: s.object('input', { city: s.string('city') }),
            handler,
          },
        ],
      });
      const snapshot: ConversationSnapshot = {
        threadId: 'mixed',
        messages: [
          { id: 'u1', role: 'user', content: 'run' },
          {
            id: 'a1',
            role: 'assistant',
            toolCalls: [
              {
                id: 'front',
                type: 'function',
                function: { name: 'frontend', arguments: '{"city":"Paris"}' },
                ...(metadata ? { metadata } : {}),
              },
            ],
          },
        ],
        interrupts: [
          {
            id: 'ficc_back',
            reason: 'tool_call',
            toolCallId: 'back',
            message: 'Approval required for tool call: backend',
            responseSchema: {
              type: 'object',
              properties: { approved: { type: 'boolean' } },
              required: ['approved'],
            },
          },
        ],
      };

      expect(() =>
        runtime.restoreConversation(snapshot, {
          expectedRevision: runtime.recovery().revision,
          structuredHistory: 'preserve-diagnostics',
        }),
      ).toThrow(/tool|unresolved/i);

      expect(handler).not.toHaveBeenCalled();
      expect(runtime.pendingInterrupts()).toBeUndefined();
    });
  }

  test(`${framework} restores native-only pending ownership with a fresh local token and rejects stale revisions`, () => {
    const runtime = createChatRuntime({ system: '' });
    const snapshot: ConversationSnapshot = {
      threadId: 'native',
      messages: [
        { id: 'u1', role: 'user', content: 'run' },
        {
          id: 'a1',
          role: 'assistant',
          toolCalls: [
            {
              id: 'back',
              type: 'function',
              function: { name: 'backend', arguments: '{}' },
            },
          ],
        },
      ],
      interrupts: [
        {
          id: 'ficc_back',
          reason: 'tool_call',
          toolCallId: 'back',
          message: 'Approval required for tool call: backend',
          responseSchema: {
            type: 'object',
            properties: { approved: { type: 'boolean' } },
            required: ['approved'],
          },
        },
      ],
    };
    const envelope = recovery.readRecovery({
      schemaVersion: 1,
      disposition: 'Pending',
      serverRevision: 5,
      snapshot,
    });
    const staleRevision = runtime.recovery().revision;
    const recoveredSnapshot = envelope.snapshot;
    if (recoveredSnapshot === undefined) {
      throw new Error('Native pending recovery did not contain a snapshot.');
    }

    runtime.restoreConversation(recoveredSnapshot, {
      expectedRevision: staleRevision,
      structuredHistory: 'preserve-diagnostics',
    });
    const first = runtime.pendingInterrupts();
    if (first === undefined) {
      throw new Error('Native recovery did not restore its first local batch.');
    }
    runtime.restoreConversation(recoveredSnapshot, {
      expectedRevision: runtime.recovery().revision,
      structuredHistory: 'preserve-diagnostics',
    });
    const second = runtime.pendingInterrupts();
    if (second === undefined) {
      throw new Error(
        'Native recovery did not restore its second local batch.',
      );
    }

    expect(second.id).not.toEqual(first.id);
    expect(second.interrupts).toEqual(snapshot.interrupts);
    expect(() =>
      runtime.restoreConversation(recoveredSnapshot, {
        expectedRevision: staleRevision,
      }),
    ).toThrow(/revision/i);
    expect(() =>
      runtime.resume({
        batchId: first.id,
        entries: [
          {
            interruptId: 'ficc_back',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
      }),
    ).toThrow(/batch/i);
    expect(runtime.pendingInterrupts()?.id).toEqual(second.id);
  });

  test(`${framework} selects the native status route only through explicit native mode`, () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
    try {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: {
          href: 'http://fixture/?recoveryUrl=http://server&recoveryMode=native',
        },
      });

      expect(recovery.recoveryEndpoint('a/b')).toBe(
        'http://server/threads/a%2Fb/native-session',
      );
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { href: 'http://fixture/?recoveryUrl=http://server' },
      });
      expect(recovery.recoveryEndpoint('a/b')).toBe(
        'http://server/threads/a%2Fb/recovery',
      );
    } finally {
      if (original) Object.defineProperty(globalThis, 'location', original);
      else Reflect.deleteProperty(globalThis, 'location');
    }
  });
}
