import { test as base, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const test = base.extend({
  context: async ({ playwright, baseURL, launchOptions }, use) => {
    const context = await playwright.chromium.launchPersistentContext(
      process.env['LOCAL_LLM_PROFILE'] ??
        join(tmpdir(), 'hashbrown-local-chrome-profile'),
      { ...launchOptions, channel: 'chrome', headless: false, baseURL },
    );
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

test('native experimental typed tool interfaces are recognized without inference', async ({
  page,
}, testInfo) => {
  const report: Record<string, unknown> = {
    scope:
      'Interface and availability checks ONLY; NOT tool inference or a Hashbrown tool adapter.',
    project: testInfo.project.name,
    browserVersion: page.context().browser()?.version(),
    modelCreationAllowed: false,
    downloadAllowed: false,
    flag: 'chrome://flags/#prompt-api-tool-use',
    featureFlags:
      'AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4',
    source:
      'https://github.com/chromium/chromium/blob/0e66b94549a8bd85f03fbdf189b752d6e7b63c32/chrome/browser/about_flags.cc#L4774',
  };

  try {
    await page.goto('/?runUrl=http://127.0.0.1/unused&localModel=chrome');
    const probe = await page.evaluate(async () => {
      interface ToolValue {
        callID?: string;
        callId?: string;
        name: string;
        arguments?: object;
        result?: unknown;
        errorMessage?: string;
      }
      type Constructor = new (init: object) => ToolValue;
      const runtime = globalThis as unknown as {
        LanguageModel?: { availability(options: object): Promise<string> };
        LanguageModelToolCall?: Constructor;
        LanguageModelToolSuccess?: Constructor;
        LanguageModelToolError?: Constructor;
      };
      const globals = Object.fromEntries(
        (
          [
            'LanguageModel',
            'LanguageModelToolCall',
            'LanguageModelToolSuccess',
            'LanguageModelToolError',
          ] as const
        ).map((name) => [name, typeof runtime[name]]),
      );
      const constructors: Record<string, unknown> = {};
      for (const [name, Constructor, fields] of [
        [
          'call',
          runtime.LanguageModelToolCall,
          { arguments: { record: 'alpha' } },
        ],
        [
          'success',
          runtime.LanguageModelToolSuccess,
          { result: [{ type: 'text', value: 'synthetic-result' }] },
        ],
        [
          'error',
          runtime.LanguageModelToolError,
          { errorMessage: 'synthetic-error' },
        ],
      ] as const) {
        if (!Constructor) continue;
        const value = new Constructor({
          callID: 'synthetic-call-1',
          callId: 'synthetic-call-1',
          name: 'lookup_secret',
          ...fields,
        });
        constructors[name] = {
          callID: value.callID,
          callId: value.callId,
          name: value.name,
          arguments: value.arguments,
          result: value.result,
          errorMessage: value.errorMessage,
        };
      }
      const text = { type: 'text', languages: ['en'] };
      const options = {
        expectedInputs: [
          text,
          { type: 'tool-call' },
          { type: 'tool-response' },
        ],
        expectedOutputs: [text, { type: 'tool-call' }],
      };
      const declarations = [
        {
          name: 'lookup_secret',
          description: 'Read a synthetic secret for record alpha.',
          inputSchema: {
            type: 'object',
            properties: { record: { type: 'string', enum: ['alpha'] } },
            required: ['record'],
            additionalProperties: false,
          },
        },
      ];
      let toolsGetterRead = false;
      Object.defineProperty(options, 'tools', {
        get() {
          toolsGetterRead = true;
          return declarations;
        },
      });
      let availability: string | undefined;
      let availabilityError: { name: string; message: string } | undefined;
      try {
        availability = await runtime.LanguageModel?.availability(options);
      } catch (cause) {
        const failure = cause as Error;
        availabilityError = { name: failure.name, message: failure.message };
      }
      return {
        globals,
        constructors,
        options: { ...options, tools: declarations },
        toolsGetterRead,
        availability,
        availabilityError,
        userAgent: navigator.userAgent,
      };
    });
    report['probe'] = probe;

    expect(probe.globals).toEqual({
      LanguageModel: 'function',
      LanguageModelToolCall: 'function',
      LanguageModelToolSuccess: 'function',
      LanguageModelToolError: 'function',
    });
    expect(probe.toolsGetterRead).toBe(true);
    expect(probe.availabilityError).toBeUndefined();
    expect([
      'unavailable',
      'downloadable',
      'downloading',
      'available',
    ]).toContain(probe.availability);
    for (const name of ['call', 'success', 'error']) {
      const value = probe.constructors[name] as {
        callID?: string;
        callId?: string;
        name: string;
      };
      expect(value.callId ?? value.callID).toBe('synthetic-call-1');
      expect(value.name).toBe('lookup_secret');
    }
    expect(probe.constructors['call']).toMatchObject({
      arguments: { record: 'alpha' },
    });
    expect(probe.constructors['success']).toMatchObject({
      result: [{ type: 'text', value: 'synthetic-result' }],
    });
    expect(probe.constructors['error']).toMatchObject({
      errorMessage: 'synthetic-error',
    });
  } finally {
    await testInfo.attach('native-tool-interface-capabilities.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  }
});
