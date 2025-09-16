export const SAMPLE_MESSAGE_VERSION = 1 as const;

export type SampleCommand =
  | {
      type: 'demo/start';
      payload?: { scenarioId?: string; speed?: number };
      meta: Meta;
    }
  | { type: 'demo/pause'; meta: Meta }
  | {
      type: 'demo/restart';
      payload?: { scenarioId?: string; hardReset?: boolean; speed?: number };
      meta: Meta;
    }
  | { type: 'demo/set-speed'; payload: { speed: number }; meta: Meta };

export type SampleEvent =
  | { type: 'demo/ready'; meta: Meta }
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

export interface Meta {
  id: string;
  ts: number;
  source: 'parent' | 'embed';
  origin: string; // sender's window.location.origin
  version: typeof SAMPLE_MESSAGE_VERSION;
}

export type Step =
  | { kind: 'click'; selector: string }
  | { kind: 'type'; selector: string; text: string; perCharDelayMs?: number }
  | { kind: 'waitFor'; selector: string; timeoutMs?: number }
  | { kind: 'delay'; durationMs: number }
  | { kind: 'chat.send'; text: string } // trigger chatbot send
  | { kind: 'chat.wait'; until: 'idle' | 'response'; timeoutMs?: number };

export interface Scenario {
  id: string;
  name: string;
  steps: Step[];
}
