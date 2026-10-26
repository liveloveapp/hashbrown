import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import type { RecipePhase } from './docs-recipe-browser';

/** One actual framework recording. */
export type LightChatbotMode = 'ui-chatbot-react' | 'ui-chatbot-angular';
/** Transport responses used by the checked clients' browser verification. */
export type LightChatbotOutcome =
  | 'success'
  | 'invalid-id'
  | 'invalid-brightness'
  | 'failed'
  | 'truncated'
  | 'multiple';
const modes: readonly LightChatbotMode[] = [
  'ui-chatbot-react',
  'ui-chatbot-angular',
];

/** Selects requested actual framework captures before any build or asset write. */
export function selectLightChatbotModes(
  requested?: string,
): LightChatbotMode[] {
  if (requested === undefined) return [...modes];
  const selected = requested.split(',');
  if (selected.some((mode) => !modes.includes(mode as LightChatbotMode)))
    throw new Error('Unknown docs UI chatbot mode');
  return modes.filter((mode) => selected.includes(mode));
}

/** Mounts a checked compiled framework component with the real SDK provider. */
export function createLightChatbotEntry(
  mode: LightChatbotMode,
  compiled: string,
): string {
  const path = (name: string) => JSON.stringify(`${compiled}/${name}`);
  return mode === 'ui-chatbot-react'
    ? `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{LightChatbot}from${path('react/src/LightChatbot.js')};const root=createRoot(document.getElementById('root'));root.render(React.createElement(HashbrownProvider,{url:'/api/chat',telemetry:false},React.createElement(LightChatbot)));window.__unmountLightChatbot=()=>root.unmount();`
    : `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{LightChatbot}from${path('angular/src/app/light-chatbot.js')};bootstrapApplication(LightChatbot,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/chat',telemetry:false})]}).then(app=>{window.__unmountLightChatbot=()=>app.destroy()}).catch(console.error);`;
}

/** Creates a browser tool call, then trusted UI only after its real result arrives. */
export function createLightChatbotEvents(
  input: RunAgentInput,
  outcome: LightChatbotOutcome = 'success',
): AGUIEvent[] {
  const identity = { threadId: input.threadId, runId: input.runId };
  const started: AGUIEvent = { type: EventType.RUN_STARTED, ...identity };
  const lastUser = input.messages.findLastIndex(
    (message) => message.role === 'user',
  );
  const result = input.messages
    .slice(lastUser + 1)
    .findLast((message) => message.role === 'tool');
  if (!result) {
    const toolCallId = `${input.runId}:readLights`;
    return [
      started,
      {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'readLights',
        parentMessageId: `${input.runId}:lookup`,
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{}' },
      { type: EventType.TOOL_CALL_END, toolCallId },
      {
        type: EventType.RUN_FINISHED,
        ...identity,
        metadata: { hashbrown: { finishReason: 'tool_calls' } },
      },
    ];
  }
  if (typeof result.content !== 'string')
    throw new Error('Expected canonical readLights result');
  const snapshot = JSON.parse(result.content) as {
    lights: { id: string; brightness: number }[];
  };
  const brightness = snapshot.lights.find(
    (light) => light.id === 'desk',
  )?.brightness;
  if (typeof brightness !== 'number')
    throw new Error('Missing actual Desk light tool result');
  const user = input.messages[lastUser];
  const reading =
    user &&
    'content' in user &&
    typeof user.content === 'string' &&
    user.content.includes('set to now');
  const node = {
    [reading ? 'LightReading' : 'LightProposal']: {
      props: {
        lightId: outcome === 'invalid-id' ? 'unknown' : 'desk',
        brightness:
          outcome === 'invalid-brightness' ? 101 : reading ? brightness : 40,
      },
    },
  };
  const messageId = `${input.runId}:answer`;
  const json = JSON.stringify({
    ui: outcome === 'multiple' ? [node, node] : [node],
  });
  // The complete card resolves before the wrapper closes and before RUN_FINISHED.
  const chunks = [json.slice(0, -2), json.slice(-2)];
  return [
    started,
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    ...chunks.map((delta): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
    })),
    { type: EventType.TEXT_MESSAGE_END, messageId },
    outcome === 'failed'
      ? {
          type: EventType.RUN_ERROR,
          message: 'The scripted transport failed after rendering a proposal.',
        }
      : {
          type: EventType.RUN_FINISHED,
          ...identity,
          metadata: {
            hashbrown: {
              finishReason: outcome === 'truncated' ? 'length' : 'stop',
            },
          },
        },
  ];
}

/** Describes the actual framework and scripted transport boundary. */
export function createLightChatbotTranscript(mode: LightChatbotMode): string {
  const framework = mode.endsWith('react') ? 'React' : 'Angular';
  return `${mode}\n\nRecorded through the checked ${framework} component after both React and Angular passed browser behavior checks. Scripted AG-UI responses enter at the HTTP transport boundary; the SDK hooks, real browser tool handler, trusted component renderer and application-owned light state run normally. Presentation styles added; no real device, no live model and no narration. State clears on refresh.\n\nThe first two seconds preview the completed conversation. Send “Set the desk light to 40%.” The actual readLights browser tool returns the Desk light at 80%. The scripted continuation selects LightProposal with validated props. Apply brightness remains disabled during streaming. After successful completion the user chooses Apply brightness, changing the local light to 40% and advancing its revision. The proposal can be applied only once. Send “What is the desk light set to now?” The actual tool returns 40% and the trusted LightReading component displays that value.\n\nInvalid IDs and brightness, failed and truncated runs, streaming-time Apply, stale and repeated proposals, cancellation, late responses, keyboard operation and unmount cleanup are checked separately in both frameworks. No model props authorize an action. The recording ends with a hold on the result.\n`;
}

/** Coalesces measured phases so each caption remains visible for at least a second. */
export function createLightChatbotCaptions(
  phases: readonly RecipePhase[],
  duration: number,
): string {
  if (!Number.isFinite(duration) || duration < 4)
    throw new Error('Invalid chatbot recording duration');
  const end = Math.floor(duration * 1000) / 1000;
  const cues = [
    { seconds: 0, text: 'Preview of the completed conversation.' },
    ...phases.map((phase) => ({
      ...phase,
      seconds: Math.round((phase.seconds + 2) * 1000) / 1000,
    })),
  ];
  const merged: { seconds: number; text: string }[] = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.seconds) || cue.seconds < 0 || cue.seconds >= end)
      throw new Error('Invalid measured chatbot phase');
    const previous = merged.at(-1);
    if (previous && cue.seconds - previous.seconds < 1)
      previous.text += ` ${cue.text}`;
    else merged.push({ ...cue });
  }
  if (merged.length > 1 && end - merged[merged.length - 1].seconds < 1) {
    const last = merged.pop();
    merged[merged.length - 1].text += ` ${last?.text}`;
  }
  const stamp = (seconds: number) =>
    new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
  return `WEBVTT\n\n${merged.map((cue, index) => `${stamp(cue.seconds)} --> ${stamp(merged[index + 1]?.seconds ?? end)}\n${cue.text}`).join('\n\n')}\n`;
}
