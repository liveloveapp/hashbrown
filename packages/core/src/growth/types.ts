import type { ResumeOptions } from '../models/interrupt';

/** Framework integration that hosts the development collector. */
export type DevelopmentIntegration = 'react' | 'angular';

/** First-time milestones the development collector reports once per session. */
export type DevelopmentMilestone =
  | 'runtime.first_stream_completed'
  | 'tool.first_call_executed'
  | 'component.first_rendered';

/** Kind of transport the runtime used when the session started. */
export type DevelopmentTransportKind =
  'http' | 'local' | 'delegating' | 'custom';

/** Options a framework package passes when it creates the development collector. */
export interface DevelopmentCollectorOptions {
  /** Framework integration reporting the events. */
  integration: DevelopmentIntegration;
  /** Published name of the framework package. */
  packageName: '@hashbrownai/react' | '@hashbrownai/angular';
  /** Published version of the framework package. */
  packageVersion: string;
  /** Returns true only in a development build of the application. */
  isDevelopment: () => boolean;
  /** Optional application switch; returning false turns the collector off. */
  enabled?: () => boolean;
}

/**
 * Options for a session start envelope: the collector options plus the opaque
 * installation token core reads from its postinstall bridge. The token is a
 * package-local correlation, never identity or authorization.
 */
export interface DevelopmentStartOptions extends DevelopmentCollectorOptions {
  /** Opaque installation token, when the postinstall step wrote one. */
  installationToken?: string | null;
}

/** Collector handle a framework package attaches to each runtime it creates. */
export interface DevelopmentCollector {
  /**
   * Observes a runtime.
   *
   * @param runtime - The runtime to observe.
   * @returns A function that stops observing the runtime.
   */
  attach(runtime: {
    readonly resume: (options: ResumeOptions) => void;
  }): () => void;
  /** Stops the collector for every attached runtime. */
  dispose(): void;
}

/** Counters describing the collector's delivery state. */
export interface DevelopmentCollectionDiagnostics {
  /** Events the endpoint acknowledged. */
  acknowledged: number;
  /** Failed delivery attempts. */
  failures: number;
  /** Events dropped without acknowledgment. */
  discarded: number;
  /** Events waiting for delivery. */
  pending: number;
}

/** A collector owner: its options and the live checks the collector consults. */
export interface RuntimeOwner {
  /** Options the owner was created with. */
  options: DevelopmentStartOptions;
  /** Returns true while collection is allowed. */
  allowed(): boolean;
  /** Returns the transport kind to report. */
  transport(): DevelopmentTransportKind;
}

/** One event the development collector sends to the runtime endpoint. */
export interface RuntimeEvent {
  /** Random UUID that deduplicates the event at the endpoint. */
  eventId: string;
  /** What happened. */
  kind: 'runtime.session_started' | DevelopmentMilestone;
  /** ISO 8601 timestamp of the event. */
  occurredAt: string;
  /** Collector wire format version. */
  collectorVersion: '1';
  /** Random browser identity; never a person or repository. */
  subject: {
    id: string;
    namespace: 'development_browser';
    scope: 'persistent' | 'memory';
  };
  /** Random session identifier. */
  sessionId: string;
  /** Opaque installation token, when one exists. */
  installationToken?: string;
  /** Event properties. */
  properties: Record<string, string>;
}

/** Every development milestone, in reporting order. */
export const MILESTONES: readonly DevelopmentMilestone[] = [
  'runtime.first_stream_completed',
  'tool.first_call_executed',
  'component.first_rendered',
];

/** Lifetime of a session start envelope, in milliseconds (one day). */
export const MAX_AGE = 86_400_000;

/** Idle time after which a new session begins, in milliseconds (thirty minutes). */
export const SESSION_IDLE = 1_800_000;

/** A version 4 UUID. */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Runtime collection endpoint. */
export const ENDPOINT = 'https://hashbrown.dev/_/growth/collect/v1/runtime';

/** Every published Hashbrown package. */
export const PACKAGE_NAMES: readonly string[] = [
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
  '@hashbrownai/openai',
  '@hashbrownai/typesafe',
  '@hashbrownai/anthropic',
  '@hashbrownai/azure',
  '@hashbrownai/bedrock',
  '@hashbrownai/google',
  '@hashbrownai/ollama',
];

/** A semantic version with an optional prerelease suffix. */
export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
