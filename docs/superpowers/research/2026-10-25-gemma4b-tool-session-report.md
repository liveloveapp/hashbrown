# Draft: Gemma E4B tool session fails during creation

Status: prepared for review; not submitted. Separate from the empty-call-ID report
[577500782](https://issues.chromium.org/issues/577500782).

## Title

Gemma E4B tool session disconnects during create despite availability returning available

## Report

I've been testing browser-local models with Hashbrown on an M1 Max Mac.
Gemma E4B works for structured output and component UI, but I'm running into a
failure when creating a session with native tools.

Here's what I'm seeing: `LanguageModel.availability()` returns `available` for
the exact tool options. Then `LanguageModel.create()` fails with
`InvalidStateError`, and Chrome logs an unexpected model-service disconnect.
This happens before a prompt is submitted or a tool runs.

I can reproduce this on Chrome Stable **155.0.8059.85** and Canary
**158.0.8122.0**, using separate test profiles on the same machine.

### Configuration

- macOS 26.5, Apple M1 Max, 32 GB RAM. Chrome reports 25,559 MiB VRAM.
- Downloaded model: `gemma-4-E4B-it`, base version `2026.04.13.0000`.
- Component version: `2026.7.28.1044`; weights: 3,659,518,480 bytes.
- No Ollama model was resident during the diagnostic.
- Flags:

```text
--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4_4b
```

The model is already downloaded before running this example. It uses the raw
browser API, with no Hashbrown code, network provider or model prompt.

### Reproduce

```js
const text = { type: 'text', languages: ['en'] };
const textOptions = { expectedInputs: [text], expectedOutputs: [text] };

console.log('text availability', await LanguageModel.availability(textOptions));
const textSession = await LanguageModel.create(textOptions);
textSession.destroy();

const toolOptions = {
  expectedInputs: [text, { type: 'tool-call' }, { type: 'tool-response' }],
  expectedOutputs: [text, { type: 'tool-call' }],
  tools: [
    {
      name: 'lookup',
      description: 'Read a synthetic value.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  ],
};

console.log('tool availability', await LanguageModel.availability(toolOptions));
const toolSession = await LanguageModel.create(toolOptions);
toolSession.destroy();
```

### Actual result

Both availability checks return `available`. The text session is created and
destroyed successfully. The tool session fails:

```text
InvalidStateError: The device is unable to create a session to run the model.
Please check the result of availability() first.
```

Stable logs include:

```text
Model recipe gemma4_4b_gpu_high_tier_model has 0 max_tokens, using fallback value 10240
Unexpected on_device_model service disconnect; reason: 0, description:
Base model disconnected unexpectedly; reason: 0, description:
```

Canary also logs the unexpected base-model and service disconnects. I don't know
whether the max_tokens warning is related to the failure.

### Expected result

The tool session should be created if the model supports these options.
If this model/tool configuration is unsupported, I'd expect the exact
availability check to report that, without disconnecting the model service.

For comparison, the installed v4 `gemma4-2b-it` model completes a native tool
round trip on the same device using the existing single-call ID workaround.
The E4B failure occurs earlier than issue 577500782: no session or call ID is
returned. On Stable 155, text inference and exact leaf/nested component UI also work
with E4B through Hashbrown in Angular and React.
