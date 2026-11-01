import { Component, computed, signal } from '@angular/core';
import { completionResource, createTool } from '@hashbrownai/angular';
import {
  candidateError,
  type CandidatePanelActions,
  candidateSystem,
  candidateWeatherSchema,
  createCandidateBrowserRuntime,
  readCandidateConfiguration,
  runCandidateWeather,
} from '../candidate-runtime';
import { CandidatePanel } from './panel';

/** Direct mounted consumer of the actual public completionResource facade. */
@Component({
  selector: 'candidate-completion',
  standalone: true,
  imports: [CandidatePanel],
  template: `<candidate-panel
    [config]="config"
    [pending]="result.pendingConversationRecovery()"
    [recovery]="result.recovery()"
    [data]="data()"
    [actions]="actions"
  >
    <pre data-testid="output">{{ jsonValue() }}</pre>
  </candidate-panel>`,
})
export class CompletionLeaf {
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
  readonly input = signal<string | undefined>(undefined);
  readonly result = completionResource({
    system: candidateSystem,
    tools: this.tools,
    transport: this.runtime.transport,
    threadId: this.config.threadId,
    input: this.input,
  });
  readonly data = computed(() => {
    this.observed();
    const value = this.result.hasValue() ? this.result.value() : null;
    return {
      output: value,
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
    start: (prompt) => this.input.set(prompt),
    next: (prompt) => this.input.set(prompt),
    stop: () => this.result.stop(),
    configuration: () => this.result.getRecoveryConfiguration(),
    restore: (snapshot, options) =>
      this.result.restoreConversation(snapshot, options),
    settle: (options) => this.result.resumeConversationRecovery(options),
    restored: () => this.input.set(this.config.prompt),
    negatives: {
      'negative-resume': () =>
        this.result.resume({
          batchId: this.result.pendingInterrupts()?.id ?? '',
          entries: [],
        }),
      'negative-generate': () => this.result.reload(),
      'negative-set-state': () => this.result.setState({ candidate: true }),
    },
  };
  /** Escaped display of the actual resource value, without an alternate model. */
  jsonValue(): string {
    return JSON.stringify(this.result.hasValue() ? this.result.value() : null);
  }
}
