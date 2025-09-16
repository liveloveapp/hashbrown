export const SAMPLE_MESSAGE_VERSION = 1 as const;

export interface Meta {
  id: string; // uuid
  ts: number; // epoch ms
  source: 'parent' | 'embed';
  origin: string; // sender origin
  version: typeof SAMPLE_MESSAGE_VERSION;
}

export type SampleCommand =
  | {
      type: 'sample/start';
      payload?: { scenarioId?: string; speed?: number };
      meta: Meta;
    }
  | { type: 'sample/pause'; meta: Meta }
  | {
      type: 'sample/restart';
      payload?: { scenarioId?: string; hardReset?: boolean; speed?: number };
      meta: Meta;
    }
  | { type: 'sample/set-speed'; payload: { speed: number }; meta: Meta };

export type SampleEvent =
  | { type: 'sample/ready'; meta: Meta }
  | {
      type: 'sample/progress';
      payload: { stepIndex: number; total: number };
      meta: Meta;
    }
  | { type: 'sample/complete'; meta: Meta }
  | {
      type: 'sample/error';
      payload: { code: string; message: string };
      meta: Meta;
    };

export type Step =
  | { kind: 'click'; selector: string }
  | { kind: 'type'; selector: string; text: string; perCharDelayMs?: number }
  | { kind: 'waitFor'; selector: string; timeoutMs?: number }
  | { kind: 'delay'; durationMs: number }
  | { kind: 'chat.send'; text: string }
  | { kind: 'chat.wait'; until: 'idle' | 'response'; timeoutMs?: number };

export interface Scenario {
  id: string;
  name: string;
  steps: Step[];
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function assertIsSampleCommand(v: unknown): asserts v is SampleCommand {
  if (
    !isRecord(v) ||
    typeof (v as any).type !== 'string' ||
    !isRecord((v as any).meta)
  ) {
    throw new Error('Invalid command');
  }
}
