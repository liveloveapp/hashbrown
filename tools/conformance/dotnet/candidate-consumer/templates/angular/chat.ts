import { Component, computed, signal } from '@angular/core';
import { chatResource, createTool } from '@hashbrownai/angular';
import {
  beginCandidateConfigAction,
  candidateError,
  type CandidatePanelActions,
  candidateSystem,
  candidateWeatherSchema,
  createCandidateBrowserRuntime,
  readCandidateConfiguration,
  runCandidateWeather,
} from '../candidate-runtime';
import { CandidatePanel } from './panel';

/** Direct mounted consumer of the actual public chatResource facade. */
@Component({
  selector: 'candidate-chat',
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
export class ChatLeaf {
  readonly config = readCandidateConfiguration();
  readonly system = signal(candidateSystem);
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

  readonly result = chatResource({
    system: this.system,
    tools: this.tools,
    transport: this.runtime.transport,
    threadId: this.config.threadId,
  });
  readonly data = computed(() => {
    this.observed();
    const hasValue = this.result.hasValue();
    const resourceError = this.result.error();
    const snapshot = this.result.snapshot();
    let valueRead: Record<string, unknown>;
    try {
      valueRead = { threw: false, value: this.result.value() };
    } catch (error) {
      valueRead = {
        threw: true,
        error: candidateError(error),
        sameResourceError: error === resourceError,
      };
    }
    const resourceProbe = {
      hasValue,
      status: this.result.status(),
      snapshot:
        snapshot.status === 'error'
          ? { status: snapshot.status, error: candidateError(snapshot.error) }
          : { status: snapshot.status, value: snapshot.value },
      snapshotErrorIsResourceError:
        snapshot.status === 'error' && snapshot.error === resourceError,
      valueRead,
      lastAssistantMessage: this.result.lastAssistantMessage() ?? null,
    };
    const value = hasValue ? this.result.value() : [];
    return {
      resourceProbe,
      configuration: this.result.getRecoveryConfiguration(),
      messages: value,
      value,
      state: this.result.state(),
      status: this.result.status(),
      isLoading: this.result.isLoading(),
      isResuming: this.result.isResuming(),
      pendingInterrupts: this.result.pendingInterrupts() ?? null,
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
      'negative-config': () => {
        const epoch = beginCandidateConfigAction();
        this.system.set(`${candidateSystem} changed ${epoch}`);
      },
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
