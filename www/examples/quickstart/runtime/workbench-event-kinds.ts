// Core-free so plain-node tools (the recorder) can validate captures.
/** Every origin of an observable change; the runtime source of the kind type. */
export const workbenchEventKinds = [
  'kit',
  'decision',
  'dismiss',
  'choose',
  'request',
  'event',
  'tool',
  'parsed',
  'accept',
  'error',
  'cancel',
  'complete',
  'user',
  'source',
  'response',
  'workflow',
  'production',
  'form',
  'pause',
  'resume',
  'history',
  'history-app',
  'javascript',
  'local-model',
] as const;
/** The origin of an observable change in the canonical example. */
export type WorkbenchEventKind = (typeof workbenchEventKinds)[number];
