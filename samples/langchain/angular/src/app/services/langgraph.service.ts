import { Injectable, signal } from '@angular/core';
import {
  Client,
  type HumanMessage,
  type Message,
} from '@langchain/langgraph-sdk';

export type Step = { prompt?: string; reason?: string };

type StreamState = {
  messages?: Message[];
  steps?: Step[];
};

type ResolvedStreamState<T extends StreamState = StreamState> = T & {
  messages: Message[];
  steps: Step[];
};

type StreamChunk = {
  event?: string;
  data?: unknown;
};

@Injectable({ providedIn: 'root' })
export class LanggraphService {
  private readonly client = new Client({ apiUrl: 'http://localhost:2024' });
  private currentAbort?: AbortController;

  readonly assistantId = signal('plan');
  readonly threadId = signal<string | null>(null);
  readonly isThreadLoading = signal(false);
  readonly isLoading = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly steps = signal<Step[]>([]);
  private stateLoaded = false;

  constructor() {
    this.restoreThreadId();
  }

  async submit(input: { messages: HumanMessage[] }): Promise<void> {
    const threadId = await this.ensureThreadId();
    if (!threadId) {
      return;
    }

    this.stop();
    const abortController = new AbortController();
    this.currentAbort = abortController;
    this.isLoading.set(true);

    try {
      const stream = this.client.runs.stream(threadId, this.assistantId(), {
        input,
        streamMode: ['values'],
        signal: abortController.signal,
        onDisconnect: 'cancel',
      });

      for await (const chunk of stream as AsyncGenerator<StreamChunk>) {
        this.handleChunk(chunk);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('LangGraph stream error', error);
      }
    } finally {
      this.isLoading.set(false);
      this.currentAbort = undefined;
    }
  }

  stop(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
    }
    this.currentAbort = undefined;
    this.isLoading.set(false);
  }

  private restoreThreadId(): void {
    if (typeof window !== 'undefined') {
      const storedId = window.localStorage.getItem('langgraph-thread-id');
      if (storedId) {
        this.threadId.set(storedId);
      }
    }
  }

  private async ensureThreadId(): Promise<string | null> {
    let threadId = this.threadId();

    // Restore from localStorage if not already set
    if (!threadId) {
      this.restoreThreadId();
      threadId = this.threadId();
    }

    // Create new thread if none exists
    if (!threadId) {
      try {
        threadId = await this.createThread();
        this.setThreadId(threadId);
      } catch (error) {
        console.error('Failed to create LangGraph thread', error);
        return null;
      }
    }

    // Fetch state if thread exists but state hasn't been loaded
    if (threadId && !this.stateLoaded) {
      await this.ensureThreadState(threadId);
    }

    return threadId;
  }

  private async createThread(): Promise<string> {
    const thread = await this.client.threads.create();
    return thread.thread_id;
  }

  private async ensureThreadState(threadId: string): Promise<void> {
    if (this.stateLoaded) {
      return;
    }

    this.isThreadLoading.set(true);
    try {
      await this.fetchThreadState(threadId);
      this.stateLoaded = true;
    } catch (error) {
      console.error('Failed to fetch LangGraph state', error);
    } finally {
      this.isThreadLoading.set(false);
    }
  }

  private async fetchThreadState(threadId: string): Promise<void> {
    try {
      const state = await this.client.threads.getState<StreamState>(threadId);
      const values = this.readStateValues<StreamState>(state?.values);
      this.messages.set(values.messages);
      this.steps.set(values.steps);
    } catch (error) {
      console.error('Failed to fetch LangGraph state', error);
    }
  }

  private handleChunk(chunk: StreamChunk): void {
    if (!chunk) {
      return;
    }

    if (chunk.event === 'metadata') {
      const metadata = chunk.data as { thread_id?: string } | undefined;
      if (metadata?.thread_id) {
        this.setThreadId(metadata.thread_id);
      }
      return;
    }

    if (chunk.event === 'values') {
      const values = this.readStateValues<StreamState>(chunk.data);
      this.messages.set(values.messages);
      this.steps.set(values.steps);
      // Mark state as loaded once we receive values from stream
      this.stateLoaded = true;
      return;
    }

    if (chunk.event === 'error') {
      console.error('LangGraph stream error chunk', chunk.data);
    }
  }

  private readStateValues<T extends StreamState = StreamState>(
    data: unknown,
  ): ResolvedStreamState<T> {
    const value = (data ?? {}) as Partial<T>;
    return {
      messages: Array.isArray(value.messages) ? value.messages : [],
      steps: Array.isArray(value.steps) ? value.steps : [],
    } as ResolvedStreamState<T>;
  }

  private setThreadId(id: string): void {
    this.threadId.set(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('langgraph-thread-id', id);
    }
  }
}
