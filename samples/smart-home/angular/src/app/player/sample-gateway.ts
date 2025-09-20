import { Injectable } from '@angular/core';
import {
  SAMPLE_MESSAGE_VERSION,
  SampleCommand,
  SampleEvent,
  Scenario,
} from 'samples-types';
import { SampleScriptService } from './sample-script';

function meta(source: 'embed') {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    ts: Date.now(),
    source,
    origin: globalThis.location.origin,
    version: SAMPLE_MESSAGE_VERSION,
  } as const;
}

// Default scenario matching the provided flow
const sceneAndChat: Scenario = {
  id: 'scene-and-chat',
  name: 'Add Scene + Dim via Chat',
  steps: [
    { kind: 'click', selector: '#add-scene-button' },
    { kind: 'waitFor', selector: '.scene-dialog', timeoutMs: 5000 },
    {
      kind: 'type',
      selector: 'input[name="sceneName"]',
      text: 'dim living room lights',
      perCharDelayMs: 60,
    },
    { kind: 'click', selector: '#submit-scene-button' },
    { kind: 'click', selector: '#chat-input' },
    {
      kind: 'type',
      selector: '#chat-input',
      text: 'show the living room lights',
      perCharDelayMs: 60,
    },
    { kind: 'chat.send', text: 'show the living room lights' },
    { kind: 'chat.wait', until: 'response', timeoutMs: 10000 },
    {
      kind: 'type',
      selector: '#chat-input',
      text: 'dim living room lights',
      perCharDelayMs: 60,
    },
    { kind: 'chat.send', text: 'dim living room lights' },
    { kind: 'chat.wait', until: 'response', timeoutMs: 10000 },
  ],
};

@Injectable({ providedIn: 'root' })
export class SampleGatewayService {
  private allowedParentOrigin: string | null = null;

  constructor(private engine: SampleScriptService) {
    // Register default scenario
    this.engine.registerScenario(sceneAndChat);

    if (typeof window !== 'undefined') {
      // determine parent origin via referrer
      try {
        const ref = document.referrer;
        if (ref) this.allowedParentOrigin = new URL(ref).origin;
      } catch {
        this.allowedParentOrigin = null;
      }
      window.addEventListener('message', this.onMessage);
      // emit ready to parent if origin known
      if (this.allowedParentOrigin) {
        window.parent?.postMessage(
          { type: 'sample/ready', meta: meta('embed') } satisfies SampleEvent,
          this.allowedParentOrigin,
        );
      }

      // wire engine events
      this.engine.onProgress = (index, total) => {
        const ev: SampleEvent = {
          type: 'sample/progress',
          payload: { stepIndex: index, total },
          meta: meta('embed'),
        };
        if (this.allowedParentOrigin)
          window.parent?.postMessage(ev, this.allowedParentOrigin);
      };
      this.engine.onComplete = () => {
        const ev: SampleEvent = {
          type: 'sample/complete',
          meta: meta('embed'),
        };
        if (this.allowedParentOrigin)
          window.parent?.postMessage(ev, this.allowedParentOrigin);
      };
      this.engine.onError = (code, message) => {
        const ev: SampleEvent = {
          type: 'sample/error',
          payload: { code, message },
          meta: meta('embed'),
        };
        if (this.allowedParentOrigin)
          window.parent?.postMessage(ev, this.allowedParentOrigin);
      };
    }
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.allowedParentOrigin || event.origin !== this.allowedParentOrigin)
      return;
    const data = event.data as SampleCommand;
    switch (data.type) {
      case 'sample/start':
        if (data.payload?.speed != null)
          this.engine.setSpeed(data.payload.speed);
        this.engine.start();
        break;
      case 'sample/pause':
        this.engine.pause();
        break;
      case 'sample/restart':
        this.engine.restart({
          hardReset: data.payload?.hardReset,
          speed: data.payload?.speed,
        });
        break;
      case 'sample/set-speed':
        this.engine.setSpeed(data.payload.speed);
        break;
      default:
        break;
    }
  };
}
