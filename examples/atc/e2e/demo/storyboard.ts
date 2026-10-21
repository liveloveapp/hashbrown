import { PROMPTS } from '../src/model';

/**
 * The atc demo video's storyboard: it alternates the real code behind each
 * Hashbrown step with the real app doing it.
 *
 * Paths are relative to `examples/atc`. Each code pane's `focal` pattern must
 * match exactly one line of its file; the director marks that line and the
 * camera keeps it in view. `holdMs` is the stillness after a beat's motion;
 * for an app beat the recorder performs the beat's action first, then holds.
 */

/** A file shown in a code beat, with the one line to mark. */
export interface CodePane {
  readonly path: string;
  readonly focal: RegExp;
}

/** The camera framings app beats use, by name (see {@link APP_FOCUS}). */
export type FocusName = 'rest' | 'map' | 'chat' | 'board';

/** One beat of the storyboard. */
export type Beat =
  | {
      readonly id: string;
      readonly kind: 'title';
      readonly headline: string;
      readonly subtitle: string;
      readonly holdMs: number;
    }
  | {
      readonly id: string;
      readonly kind: 'code';
      readonly headline: string;
      readonly panes: readonly CodePane[];
      readonly holdMs: number;
    }
  | {
      readonly id: string;
      readonly kind: 'app';
      readonly headline: string;
      readonly focus: FocusName;
      /** The question the recorder sends, by its {@link DEMO_PROMPTS} name, or null to just watch the map. */
      readonly prompt: DemoPrompt | null;
      /** Where the camera moves once the answer has rendered, if anywhere. */
      readonly then?: FocusName;
      /** Clears the map filter after the hold, so later beats see every plane. */
      readonly clearFilter?: boolean;
      readonly holdMs: number;
    }
  | {
      readonly id: string;
      readonly kind: 'close';
      readonly headline: string;
      readonly command: string;
      readonly holdMs: number;
    };

/** The app beats' prompts, from the app's own starter list. */
export const DEMO_PROMPTS = {
  near: PROMPTS.nearBend,
  arrivals: PROMPTS.seattleArrivals,
  follow: PROMPTS.followFastest,
  filter: PROMPTS.filterJets,
} as const;

/** The name of one of {@link DEMO_PROMPTS}. */
export type DemoPrompt = keyof typeof DEMO_PROMPTS;

/** The demo, beat by beat. */
export const STORYBOARD: readonly Beat[] = [
  {
    id: 'title',
    kind: 'title',
    headline: 'atc',
    subtitle: 'Live air traffic you can talk to, built with Hashbrown',
    holdMs: 1400,
  },
  {
    id: 'sky',
    kind: 'app',
    headline: 'The sky, live.',
    focus: 'map',
    prompt: null,
    holdMs: 2600,
  },
  {
    id: 'decide',
    kind: 'code',
    headline: 'Decide where it goes.',
    panes: [
      {
        path: 'angular/src/app/router.ts',
        focal: /const decision = decisionResource\(\{/,
      },
      {
        path: 'react/src/router.ts',
        focal: /const decision = useDecision\(\{/,
      },
    ],
    holdMs: 2400,
  },
  {
    id: 'filter',
    kind: 'app',
    headline: 'Filter the map in plain words.',
    focus: 'rest',
    prompt: 'filter',
    then: 'map',
    clearFilter: true,
    holdMs: 2600,
  },
  {
    id: 'schema',
    kind: 'code',
    headline: 'One schema, four uses.',
    panes: [
      {
        path: 'shared/src/find-aircraft.ts',
        focal: /^export const mapFilterSchema = /,
      },
      {
        path: 'angular/src/app/filter.ts',
        focal: /const resource = structuredCompletionResource\(\{/,
      },
    ],
    holdMs: 2600,
  },
  {
    id: 'components',
    kind: 'code',
    headline: 'Expose your components.',
    panes: [
      { path: 'shared/src/contracts.ts', focal: /^\s+hex: s\.string\($/ },
    ],
    holdMs: 2200,
  },
  {
    id: 'ask',
    kind: 'app',
    headline: 'Ask in plain words.',
    focus: 'rest',
    prompt: 'near',
    then: 'board',
    holdMs: 2400,
  },
  {
    id: 'tools',
    kind: 'code',
    headline: 'Tools run in the browser.',
    panes: [
      {
        path: 'shared/src/tools.ts',
        focal: /aircraft: findAircraft\(/,
      },
      {
        path: 'angular/src/app/assistant.ts',
        focal: /createTool\(this\.atcTools\.findAircraft\),/,
      },
    ],
    holdMs: 2600,
  },
  {
    id: 'narrow',
    kind: 'code',
    headline: 'Narrow the cards.',
    panes: [
      {
        path: 'angular/src/app/assistant.ts',
        focal: /private readonly narrowed = uiDecisionResource\(\{/,
      },
      {
        path: 'react/src/assistant.tsx',
        focal: /const narrowed = useUiDecision\(\{/,
      },
    ],
    holdMs: 2400,
  },
  {
    id: 'arrivals',
    kind: 'app',
    headline: 'Two cards, not four.',
    focus: 'rest',
    prompt: 'arrivals',
    then: 'map',
    holdMs: 2200,
  },
  {
    id: 'stream',
    kind: 'code',
    headline: 'Angular or React.',
    panes: [
      {
        path: 'angular/src/app/assistant.ts',
        focal: /protected readonly chat = uiChatResource\(\{/,
      },
      { path: 'react/src/assistant.tsx', focal: /const chat = useUiChat\(\{/ },
    ],
    holdMs: 2400,
  },
  {
    id: 'follow',
    kind: 'app',
    headline: 'Follow one.',
    focus: 'rest',
    prompt: 'follow',
    holdMs: 3000,
  },
  {
    id: 'close',
    kind: 'close',
    headline: 'Your components. Your tools. Streaming.',
    command: 'npm install @hashbrownai/angular',
    holdMs: 1800,
  },
];

/**
 * Camera framings for app beats, over the app as the frame shows it. The app
 * lays out at a fixed 1440x810 and the frame scales it to fit, so a
 * percentage of the camera is the same percentage of the app. The chat panel
 * is on the left and the map fills the rest. `origin` is the point the zoom
 * holds still.
 */
export const APP_FOCUS: Readonly<
  Record<FocusName, { readonly scale: number; readonly origin: string }>
> = {
  rest: { scale: 1, origin: '50% 50%' },
  map: { scale: 1.5, origin: '100% 45%' },
  chat: { scale: 1.6, origin: '0% 100%' },
  board: { scale: 1.45, origin: '0% 60%' },
};

/** Every file the storyboard shows, once each, in first-use order. */
export function storyboardPaths(storyboard = STORYBOARD): string[] {
  return [
    ...new Set(
      storyboard.flatMap((beat) =>
        beat.kind === 'code' ? beat.panes.map((pane) => pane.path) : [],
      ),
    ),
  ];
}

/** The scene name the recorder gives a beat: `beat-03-ask`. */
export function beatSceneName(index: number, beat: Beat): string {
  return `beat-${String(index).padStart(2, '0')}-${beat.id}`;
}
