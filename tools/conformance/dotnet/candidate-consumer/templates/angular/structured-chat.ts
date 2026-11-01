import { Component, computed, signal } from '@angular/core';
import { createTool, structuredChatResource } from '@hashbrownai/angular';
import {
  candidateAnswerSchema,
  candidateError,
  type CandidatePanelActions,
  candidateSystem,
  candidateWeatherSchema,
  createCandidateBrowserRuntime,
  readCandidateConfiguration,
  runCandidateWeather,
} from '../candidate-runtime';
import { CandidatePanel } from './panel';

/** Direct mounted consumer of the actual public structuredChatResource facade. */
@Component({
  selector: 'candidate-structured-chat',
  standalone: true,
  imports: [CandidatePanel],
  template: `<candidate-panel
    [config]="config"
    [pending]="result.pendingConversationRecovery()"
    [recovery]="result.recovery()"
    [data]="data()"
    [actions]="actions"
  >
    <pre data-testid="messages">{{ jsonValue() }}</pre>
  </candidate-panel>`,
})
export class StructuredChatLeaf {
  readonly config = readCandidateConfiguration();
  readonly observed = signal(0);
  readonly runtime = createCandidateBrowserRuntime(this.config, () =>
    this.observed.update((value) => value + 1),
  );
  readonly tools = [
    createTool({
      name: 'getWeather',
      description: 'Read the weather for a city',
      schema: candidateWeatherSchema,
      handler: (args, signal) => runCandidateWeather(this.config, args, signal),
    }),
  ];

  readonly result = structuredChatResource({
    system: candidateSystem,
    tools: this.tools,
    transport: this.runtime.transport,
    threadId: this.config.threadId,
    schema: candidateAnswerSchema,
    retries: 0,
  });
  readonly data = computed(() => {
    this.observed();
    const value = this.result.hasValue() ? this.result.value() : [];
    return {
      messages: value,
      value,
      state: this.result.state(),
      status: this.result.status(),
      isLoading: this.result.isLoading(),
      isResuming: this.result.isResuming(),
      error: this.result.error() ? candidateError(this.result.error()) : null,
      ...this.runtime.observations(),
    };
  });
  readonly actions: CandidatePanelActions = {
    start: (prompt) =>
      this.result.sendMessage({ role: 'user', content: prompt }),
    next: (prompt) =>
      this.result.sendMessage({ role: 'user', content: prompt }),
    stop: () => this.result.stop(),
    configuration: () => this.result.getRecoveryConfiguration(),
    restore: (snapshot, options) =>
      this.result.restoreConversation(snapshot, options),
    settle: (options) => this.result.resumeConversationRecovery(options),

    negatives: {
      'negative-resume': () =>
        this.result.resume({
          batchId: this.result.pendingInterrupts()?.id ?? '',
          entries: [],
        }),
      'negative-generate': () => this.result.reload(),
      'negative-set-state': () => this.result.setState({ candidate: true }),
      'negative-send': () =>
        this.result.sendMessage({
          role: 'user',
          content: this.config.nextPrompt,
        }),
      'negative-set-messages': () => this.result.setMessages([]),
    },
  };
  /** Escaped display of the actual resource value, without an alternate model. */
  jsonValue(): string {
    return JSON.stringify(this.result.hasValue() ? this.result.value() : null);
  }
}
