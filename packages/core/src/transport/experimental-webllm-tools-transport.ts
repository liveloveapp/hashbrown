import type { WebLlmEngine } from './experimental-webllm-transport';

/** Application-selected structured inference phase. @alpha */
export type WebLlmToolPhase =
  | { readonly type: 'tool'; readonly name: string }
  | { readonly type: 'finalize' };

/** Completed canonical tool call and its unmodified result text. @alpha */
export interface WebLlmToolPhaseResult {
  readonly callId: string;
  readonly name: string;
  /** Bounded JSON object owned and deeply frozen before selection. Validate nested values before consuming them. */
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly result: {
    readonly type: 'success' | 'error';
    readonly text: string;
  };
}

/** Deeply owned and frozen current user turn supplied to the selector. @alpha */
export interface WebLlmToolsTurnContext {
  readonly threadId: string;
  readonly runId: string;
  readonly userMessage: { readonly id: string; readonly content: string };
  readonly completedCalls: readonly WebLlmToolPhaseResult[];
}

/**
 * Configuration for application-controlled text-only structured tool phases.
 * Tool argument schemas use the Skillet-convertible closed-object subset and
 * reject format annotations, which Skillet does not validate at runtime.
 * Explicit types must be valid supported types; enum entries must all match
 * their explicit primitive type, including integer constraints.
 * @alpha
 */
export interface ExperimentalWebLlmToolsTransportOptions {
  /** Loaded text engine; the application owns model loading and unloading. */
  engine: WebLlmEngine;
  /** Selects an already loaded model. */
  model?: string;
  /** Synchronously selects one declared tool or final schema generation. A response schema is required. */
  toolPhase: (context: WebLlmToolsTurnContext) => WebLlmToolPhase;
  /** Structured tool phases accept text input only. */
  media?: never;
}
