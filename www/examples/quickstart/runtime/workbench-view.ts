import { createWorkbenchTabs } from './workbench-tabs';
import { workbenchLocalInspection } from './workbench-local-inspection';
import { workbenchJavaScriptInspection } from './workbench-javascript-inspection';
import { workbenchJavaScriptScripts } from './workbench-javascript';
import { workbenchUiInspection } from './workbench-ui-inspection';
import { getWorkbenchUiPrompts } from './workbench-ui-kits';
import { workbenchAuthoringInspection } from './workbench-authoring-view';
import { workbenchAuthoringPrompts } from './workbench-authoring';
import { workbenchAgentPrompts } from './workbench-agent';
import { workbenchServerInspection } from './workbench-server-view';
import {
  canSaveWorkbenchHistory,
  isWorkbenchHistoryBusy,
  workbenchHistoryPrompts,
} from './workbench-history';
import {
  renderWorkbenchCode,
  workbenchCodeLanguage,
} from './workbench-highlight';
import {
  isWorkbenchWorkflowProgress,
  workbenchWorkflowPrompts,
} from './workbench-workflows';
import { readWorkflowForm } from './workbench-workflow-form';
import {
  workbenchBrowserInstructions,
  workbenchOnboardingPrompts,
} from './workbench-onboarding';
import { s } from '@hashbrownai/core';
import {
  getWorkbenchPlanSchema,
  workbenchDecisionPlan,
  workbenchDecisionPrompts,
} from './workbench';
import {
  createWorkbenchLayoutStore,
  workbenchLayout,
  type WorkbenchLayoutStore,
} from './workbench-layout';
import {
  getWorkbenchLesson,
  type WorkbenchLesson,
  type WorkbenchLessonId,
  workbenchLessons,
} from './workbench-lessons';
import { workbenchIcon, type WorkbenchIconName } from './workbench-icons';
import {
  adjacentTurnIndex,
  formatPlaybackSeconds,
  nextPlaybackSpeed,
  workbenchFlagAnchor,
  workbenchSegmentFill,
  workbenchShortcut,
  workbenchTickPercent,
  workbenchTurnSegments,
} from './workbench-player';
import {
  renderWorkbenchSidebar,
  workbenchSidebarScrollDelta,
} from './workbench-sidebar';
import {
  getWorkbenchEmbedMode,
  type WorkbenchEmbedMode,
} from './workbench-embed';
import { attachWorkbenchMessages } from './workbench-messages';
import {
  createWorkbenchCapture,
  type WorkbenchCapture,
} from './workbench-capture';
import { createWorkbenchSplit } from './workbench-split';
import { attachWorkbenchScrub } from './workbench-scrub';
import { createWorkbenchRequestsView } from './workbench-requests-view';
import { workbenchRecipePrompts } from './workbench-recipes';
import {
  workbenchRecipeEventLabel,
  workbenchRecipeInspection,
} from './workbench-recipe-view';
import {
  withWorkbenchMilestoneIds,
  workbenchMilestones,
} from './workbench-timeline';
import {
  isWorkbenchPlan,
  type WorkbenchSnapshot,
  type WorkbenchStore,
} from './workbench';

/** The application revision and user turn that produced a proposal. */
export interface ProposalOrigin {
  readonly turn: number;
  readonly revision: number;
}
/** Props supplied to the trusted SummaryCard. */
export interface SummaryProps {
  readonly title: string;
  readonly steps: readonly string[];
}
/** The canonical prompts for the two-turn example. */
export const workbenchPrompts = [
  'Turn this idea into a two-step plan: show how a model renders trusted UI.',
  'Make the second step shorter.',
] as const;
/** Associates each assistant message with its preceding application-owned user origin. */
export function messageOrigins(
  messages: readonly { readonly id?: string; readonly role: string }[],
  users: Readonly<Record<string, ProposalOrigin>>,
): Readonly<Partial<Record<string, ProposalOrigin>>> {
  let origin: ProposalOrigin = { turn: -1, revision: -1 };
  return Object.fromEntries(
    messages.flatMap((message) => {
      if (message.role === 'user')
        origin = users[message.id ?? ''] ?? { turn: -1, revision: -1 };
      return message.role === 'assistant' && message.id
        ? [[message.id, origin]]
        : [];
    }),
  );
}
/** Reads healthy resource messages and preserves the last safe history after a resource error. */
export function readWorkbenchMessages<T>(
  error: unknown,
  read: () => T,
  previous: T,
): T {
  return error ? previous : read();
}

/** Gates a proposal against live state as well as the immutable message origin. */
export function canAcceptSummary(
  snapshot: Pick<
    WorkbenchSnapshot,
    'cursor' | 'turn' | 'status' | 'application'
  >,
  origin: ProposalOrigin,
  props: SummaryProps,
  used: boolean,
): boolean {
  return (
    !used &&
    snapshot.cursor === null &&
    snapshot.status === 'complete' &&
    snapshot.turn === origin.turn &&
    snapshot.application.revision === origin.revision &&
    isWorkbenchPlan(props)
  );
}
/** Cancels a loading capture and stops the SDK only while it has active work. */
export function stopWorkbench(
  store: WorkbenchStore,
  runtime: {
    readonly isLoading: boolean;
    readonly isSending?: boolean;
    readonly isReceiving?: boolean;
    readonly isGenerating?: boolean;
    readonly isResuming?: boolean;
    readonly stop: () => void;
  },
): void {
  if (store.getSnapshot().status === 'loading') store.settle('cancelled');
  if (
    runtime.isLoading ||
    runtime.isSending ||
    runtime.isReceiving ||
    runtime.isGenerating ||
    runtime.isResuming
  )
    runtime.stop();
}

/** Uses recorded timing, limiting long pauses for an inspectable demonstration. */
export function playbackDelay(
  previous: number,
  next: number,
  speed: number,
): number {
  return Math.max(40, Math.min(1200, (next - previous) / speed));
}
/** Framework-owned commands invoked only from live user actions. */
export interface WorkbenchCommands {
  readonly framework: string;
  /** Lets a framework render captured chat in the live mount during read-only replay. */
  readonly managedChat?: boolean;
  readonly lesson?: {
    readonly id: string;
    readonly title: string;
    readonly format: WorkbenchLesson['format'];
    readonly inspector: string;
    /** The configured endpoint, shown for requests that carry no URL. */
    readonly endpoint?: string;
  };
  readonly setDebugDenied?: (denied: boolean) => void;
  readonly send: (content: string) => void;
  readonly stop: () => void;
  readonly reset: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const node = element('button', text);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function iconButton(
  label: string,
  icon: WorkbenchIconName,
  action: () => void,
): HTMLButtonElement {
  const node = button('', action);
  node.setAttribute('aria-label', label);
  node.title = label;
  node.append(workbenchIcon(icon));
  return node;
}
/**
 * Rebuilds `container` and, when focus was on one of its keyed children,
 * moves focus to the rebuilt child with the same key.
 */
function rebuildKeepingFocus(
  container: HTMLElement,
  key: string,
  rebuild: () => void,
): void {
  const active = container.ownerDocument.activeElement;
  const restore =
    active instanceof HTMLElement && container.contains(active)
      ? active.closest<HTMLElement>(`[${key}]`)?.getAttribute(key)
      : null;
  rebuild();
  if (restore == null) return;
  [...container.querySelectorAll<HTMLElement>(`[${key}]`)]
    .find((node) => node.getAttribute(key) === restore)
    ?.focus();
}
function playbackSpeedLabel(speed: number): string {
  return speed === 0.5 ? '½×' : `${speed}×`;
}
function pre(value: unknown, tab: string): HTMLPreElement {
  const source =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const language =
    source === undefined ? 'text' : workbenchCodeLanguage(value, tab);
  const block = document.createElement('pre');
  block.dataset.language = language;
  block.append(
    renderWorkbenchCode(source ?? 'Waiting for captured data', language),
  );
  return block;
}

/** Names the captured teaching moment without hiding its original payload in Raw. */
export function workbenchEventLabel(
  event: WorkbenchSnapshot['events'][number],
  format?: WorkbenchLesson['format'],
): string {
  const recipeLabel = workbenchRecipeEventLabel(event);
  if (recipeLabel) return recipeLabel;
  if (event.kind === 'response')
    return `HTTP ${event.payload && typeof event.payload === 'object' && 'status' in event.payload ? event.payload.status : 'response'}`;
  if (
    event.kind === 'event' &&
    event.payload &&
    typeof event.payload === 'object' &&
    'name' in event.payload &&
    event.payload.name === 'workbench.request-transformation'
  )
    return 'Request transformed';
  if (
    event.kind === 'event' &&
    event.payload &&
    typeof event.payload === 'object' &&
    'kind' in event.payload &&
    event.payload.kind === 'hashbrown.decision'
  )
    return 'Decision response';
  if (
    event.kind === 'event' &&
    event.payload &&
    typeof event.payload === 'object' &&
    'type' in event.payload
  ) {
    const names: Record<string, string> = {
      RUN_STARTED: 'Run started',
      STATE_SNAPSHOT: 'Shared state snapshot',
      STATE_DELTA: 'Shared state patch',
      ACTIVITY_SNAPSHOT: 'Activity started',
      ACTIVITY_DELTA: 'Activity updated',
      RUN_FINISHED: 'Run finished',
      RUN_ERROR: 'Run failed',
      TOOL_CALL_START: 'Call tool',
      TOOL_CALL_ARGS: 'Tool arguments',
      TOOL_CALL_END: 'Tool ready',
      TEXT_MESSAGE_START:
        format === 'text' || format === 'workflow' || format === 'history'
          ? 'Text start'
          : 'JSON start',
      TEXT_MESSAGE_CONTENT:
        format === 'text' || format === 'workflow' || format === 'history'
          ? 'Text chunk'
          : 'JSON chunk',
      TEXT_MESSAGE_END:
        format === 'text' || format === 'workflow' || format === 'history'
          ? 'Text end'
          : 'JSON end',
      DECISION_RESPONSE: 'Decision response',
    };
    return names[String(event.payload.type)] ?? String(event.payload.type);
  }
  return (
    {
      production: 'Application recovery observation',
      event: 'Stream event',
      user: 'Prompt',
      request: 'Request',
      tool: 'Tool result',
      kit: 'Kit configured',
      javascript: 'QuickJS observed',
      'local-model': 'Local model preparation',
      parsed: 'Resolved props',
      accept: 'Plan accepted',
      complete: 'Complete',
      error: 'Error',
      cancel: 'Cancelled',
      source: 'Source',
      response: 'HTTP response',
      decision: 'Decision',
      choose: 'Suggestion applied',
      dismiss: 'Suggestion dismissed',
      workflow: 'SDK workflow observed',
      form: 'Application form draft',
      pause: 'Paused for decisions',
      resume: 'Resume requested',
      history: 'SDK history observed',
      'history-app': `Text ${event.history?.app.action ?? 'action'}`,
    }[event.kind] ?? event.kind
  );
}

/** The page hook recorders call to save the visible workbench's capture. */
interface WorkbenchCaptureGlobal {
  hashbrownWorkbench?: {
    readonly capture: (recordedAt: string) => WorkbenchCapture;
  };
}
// Retained conversations mount several shells; the visible one is captured.
const captureSources: {
  readonly root: HTMLElement;
  readonly capture: (recordedAt: string) => WorkbenchCapture;
}[] = [];
function exposeWorkbenchCapture() {
  const host = globalThis as WorkbenchCaptureGlobal;
  if (!captureSources.length) {
    delete host.hashbrownWorkbench;
    return;
  }
  host.hashbrownWorkbench = {
    capture: (recordedAt) =>
      (
        [...captureSources]
          .reverse()
          .find((source) => !source.root.closest('[hidden]')) ??
        captureSources[captureSources.length - 1]
      ).capture(recordedAt),
  };
}

/** Navigation shared by retained, independent framework conversation instances. */
export interface WorkbenchNavigation {
  readonly currentId: string;
  readonly conversations: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly select: (id: string) => void;
  readonly create: () => void;
}

/** Optional collaborators for {@link mountWorkbench}. */
export interface WorkbenchMountOptions {
  /** The layout preference store; defaults to the shared `workbenchLayout`. */
  readonly layout?: WorkbenchLayoutStore;
  /** The installed UI owns its composer; omit the shell composer. */
  readonly externalComposer?: boolean;
  /** Render captured assistant messages as plain text in replay. */
  readonly plainTextReplay?: boolean;
  /** An explicit set of inspector tabs for an externally owned runtime. */
  readonly inspectorTabs?: readonly string[];
  /** Projects actual runtime observations into the selected inspector. */
  readonly inspection?: (
    tab: string,
    snapshot: WorkbenchSnapshot,
  ) =>
    | {
        readonly heading: string;
        readonly value: unknown;
        readonly detailHeading: string;
        readonly detail: unknown;
      }
    | undefined;
  /** Omits the new-conversation action when no reset adapter is installed. */
  readonly disableNewConversation?: boolean;
  /** Names the only hosted topic when this is an isolated consumer shell. */
  readonly fixedSidebarTopic?: string;
  /**
   * Embedded in a docs page: no sidebar, no new conversation, and the layout
   * is read but never saved. Defaults to the page's `?embed=` value.
   */
  readonly embed?: WorkbenchEmbedMode;
}

/**
 * Mounts a shared accessible shell, leaving live rendering entirely to the framework.
 *
 * @param host - The element the shell is appended to.
 * @param store - The workbench capture store.
 * @param commands - Framework-owned live commands.
 * @param options - Optional collaborators such as the layout store.
 */
export function mountWorkbench(
  host: HTMLElement,
  store: WorkbenchStore,
  commands: WorkbenchCommands,
  options: WorkbenchMountOptions = {},
): {
  readonly live: HTMLElement;
  readonly dispose: () => void;
  readonly pause: () => void;
  readonly navigation: (value: WorkbenchNavigation) => void;
} {
  const instanceId = crypto.randomUUID();
  const embed =
    options.embed === undefined
      ? getWorkbenchEmbedMode(globalThis.location?.search ?? '')
      : options.embed;
  const sharedLayout = options.layout ?? workbenchLayout;
  // Embedded mounts start from the saved layout but keep changes in memory.
  const layoutStore: WorkbenchLayoutStore = embed
    ? createWorkbenchLayoutStore()
    : sharedLayout;
  if (embed) layoutStore.set(sharedLayout.get(), { persist: false });
  const debugging = commands.lesson?.id === 'debugging';
  let debugDenied = debugging;
  const recipePrompts =
    commands.lesson && Object.hasOwn(workbenchRecipePrompts, commands.lesson.id)
      ? workbenchRecipePrompts[
          commands.lesson.id as keyof typeof workbenchRecipePrompts
        ]
      : undefined;
  const onboardingPrompts =
    commands.lesson &&
    Object.hasOwn(workbenchOnboardingPrompts, commands.lesson.id)
      ? workbenchOnboardingPrompts[
          commands.lesson.id as keyof typeof workbenchOnboardingPrompts
        ]
      : undefined;
  const uiPrompts =
    commands.lesson?.id === 'ui-kits' || commands.lesson?.id === 'ui-chatbot'
      ? getWorkbenchUiPrompts(commands.lesson.id)
      : undefined;
  const prompts =
    (commands.lesson?.id === 'local-models'
      ? [
          'Create a two-step plan to outline and record a trusted UI demo.',
          'Keep the first step and make the second step shorter.',
        ]
      : undefined) ??
    (commands.lesson?.id === 'javascript-runtime'
      ? [workbenchJavaScriptScripts[0].code, workbenchJavaScriptScripts[1].code]
      : undefined) ??
    uiPrompts ??
    onboardingPrompts ??
    recipePrompts ??
    (commands.lesson?.id === 'agent-decisions'
      ? workbenchAgentPrompts
      : ['json-parser', 'natural-forms'].includes(commands.lesson?.id ?? '')
        ? workbenchAuthoringPrompts
        : commands.lesson?.format === 'history'
          ? workbenchHistoryPrompts
          : commands.lesson?.format === 'workflow'
            ? workbenchWorkflowPrompts
            : commands.lesson?.format === 'decision'
              ? workbenchDecisionPrompts
              : workbenchPrompts);
  let navigation: WorkbenchNavigation | undefined;
  const root = element('main', '', 'wb');
  if (embed) {
    root.classList.add('wb-embed');
    root.dataset.embed = embed;
  }
  const header = element('header', '', 'wb-header');
  header.append(
    element('strong', 'Hashbrown'),
    element('span', commands.lesson?.title ?? 'Conversation workbench'),
    element('span', commands.framework, 'wb-muted'),
  );
  const provenance = element('span', 'Awaiting source', 'wb-muted');
  provenance.dataset.source = '';
  header.append(provenance);
  const layout = element('div', '', 'wb-layout');
  const nav = element('nav', '', 'wb-nav');
  nav.setAttribute('aria-label', 'Examples and conversations');
  let sidebarKey: string | undefined;
  function renderLayout() {
    const current = layoutStore.get();
    layout.style.setProperty('--wb-chat', `${current.split}fr`);
    layout.style.setProperty('--wb-inspector', `${100 - current.split}fr`);
    const key = JSON.stringify([current.rail, current.collapsed]);
    if (key !== sidebarKey) renderNavigation();
  }
  function renderNavigation() {
    if (embed) return;
    const current = layoutStore.get();
    sidebarKey = JSON.stringify([current.rail, current.collapsed]);
    root.classList.toggle('wb-rail', current.rail);
    renderWorkbenchSidebar(nav, {
      framework: commands.framework,
      fixedTopic: options.fixedSidebarTopic,
      hideCreate: options.disableNewConversation || !!embed,
      currentLesson: (commands.lesson?.id ??
        'generative-ui') as WorkbenchLessonId,
      conversations: navigation?.conversations ?? [
        { id: 'default', label: 'Two-step plan' },
      ],
      currentConversation: navigation?.currentId ?? 'default',
      layout: current,
      idPrefix: instanceId,
      onSelect: (id) => {
        pause();
        if (navigation) navigation.select(id);
        else store.live();
      },
      onCreate: () => {
        pause();
        if (navigation) navigation.create();
        else {
          commands.reset();
          store.clear();
          prompt.value = prompts[0];
        }
      },
      onToggleRail: () => layoutStore.set({ rail: !layoutStore.get().rail }),
      onToggleSection: (section) => {
        const { collapsed } = layoutStore.get();
        layoutStore.set({
          collapsed: collapsed.includes(section)
            ? collapsed.filter((item) => item !== section)
            : [...collapsed, section],
        });
      },
    });
    // Refreshing a group can reset its scroll position; reveal the lesson without moving focus.
    const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
    const focused = nav.ownerDocument.activeElement;
    if (selected)
      nav.scrollTop += workbenchSidebarScrollDelta(
        nav.getBoundingClientRect(),
        selected.getBoundingClientRect(),
        focused && nav.contains(focused)
          ? focused.getBoundingClientRect()
          : undefined,
      );
  }
  const chat = element('section', '', 'wb-chat wb-panel');
  chat.setAttribute('aria-label', 'Conversation');
  const chatHeader = element('div', '', 'wb-panel-head');
  const status = element('span', 'Ready', 'wb-muted');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  chatHeader.append(
    element(
      'h1',
      commands.lesson?.id === 'javascript-runtime'
        ? 'Calculate from your plan'
        : 'A plan, built together',
    ),
    status,
  );
  const live = element('div', '', 'wb-feed');
  let following = true;
  live.onscroll = () => {
    following = live.scrollHeight - live.scrollTop - live.clientHeight < 32;
  };
  live.dataset.live = '';
  const replay = element('div', '', 'wb-feed');
  replay.dataset.replay = '';
  replay.hidden = true;
  const form = element('form', '', 'wb-composer');
  const label = element('label', 'Your message');
  label.htmlFor = `${instanceId}-prompt`;
  const prompt = element('textarea');
  prompt.id = `${instanceId}-prompt`;
  prompt.value = prompts[0];
  prompt.rows = 2;
  const actions = element('div', '', 'wb-actions');
  const send = element('button', 'Send', 'wb-primary');
  send.type = 'submit';
  send.dataset.send = '';
  const stop = button('Stop', commands.stop);
  const first = button('First prompt', () => {
    prompt.value = prompts[0];
    prompt.focus();
  });
  const followup = button('Follow-up', () => {
    prompt.value = prompts[1];
    prompt.focus();
  });
  actions.append(first, followup, send, stop);
  form.append(label, prompt, actions);
  if (commands.lesson?.id === 'javascript-runtime') {
    label.hidden =
      prompt.hidden =
      first.hidden =
      followup.hidden =
      send.hidden =
        true;
    form.classList.add('wb-runtime-bar');
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    const snapshot = store.getSnapshot();
    // A read-only replay never reaches the model, whatever the form shows.
    if (
      snapshot.readOnly ||
      snapshot.cursor !== null ||
      snapshot.status === 'loading' ||
      snapshot.frame?.localModel?.state === 'preparing' ||
      !prompt.value.trim()
    )
      return;
    following = true;
    commands.send(prompt.value.trim());
    prompt.value = '';
  };
  const debugControls = element('div', '', 'wb-debug-controls');
  const denyCheckbox = element('input');
  denyCheckbox.type = 'checkbox';
  denyCheckbox.checked = debugDenied;
  denyCheckbox.setAttribute('aria-label', 'Demo denial');
  denyCheckbox.onchange = () => {
    debugDenied = denyCheckbox.checked;
    commands.setDebugDenied?.(debugDenied);
  };
  const scenarioLabel = element('label', 'Deny requests for this demo');
  scenarioLabel.prepend(denyCheckbox);
  debugControls.append(
    scenarioLabel,
    element(
      'p',
      'Intentional local HTTP 403 before provider work. This is a demo switch, not authentication.',
      'wb-muted',
    ),
  );
  chat.append(
    chatHeader,
    ...(debugging ? [debugControls] : []),
    live,
    replay,
    ...(options.externalComposer ? [] : [form]),
  );
  const inspector = element('section', '', 'wb-panel wb-inspector');
  inspector.setAttribute('aria-label', 'Inspector');
  const tabs = element('div', '', 'wb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Inspector views');
  const selection = element('div', '', 'wb-selection');
  // One tab panel holds either the captured/detail pair or the Requests view.
  const tabPanel = element('div', '', 'wb-tabpanel');
  tabPanel.id = `${instanceId}-inspection`;
  tabPanel.setAttribute('role', 'tabpanel');
  const pair = element('div', '', 'wb-pair');
  tabPanel.append(pair);
  const requestsView = createWorkbenchRequestsView({
    instanceId,
    seek: (index) => {
      pause();
      store.seek(index);
    },
  });
  /** The Requests tab's failure alert, while the selected moment failed. */
  let requestsIssue: HTMLElement | undefined;
  const captured = element('section', '', 'wb-section');
  captured.dataset.captured = '';
  const capturedHeading = element('h3');
  let rawFrame = false;
  const rawFrameToggle = button('{ }', () => {
    rawFrame = !rawFrame;
    render();
  });
  rawFrameToggle.className = 'wb-raw';
  rawFrameToggle.setAttribute('aria-label', 'Show captured frame');
  rawFrameToggle.setAttribute('aria-pressed', 'false');
  const capturedSub = element('span', '', 'wb-section-sub');
  const capturedHeader = element('header', '', 'wb-section-head');
  capturedHeader.append(capturedHeading, capturedSub, rawFrameToggle);
  const inspection = element('div', '', 'wb-inspection');
  captured.append(capturedHeader, inspection);
  const detail = element('section', '', 'wb-section');
  detail.dataset.detail = '';
  pair.append(captured, detail);
  let tab = commands.lesson?.inspector ?? 'JSON';
  const tabButtons = (
    options.inspectorTabs ?? [
      ['json-parser', 'natural-forms'].includes(commands.lesson?.id ?? '')
        ? 'JSON'
        : ['text', 'workflow', 'history'].includes(
              commands.lesson?.format ?? '',
            )
          ? commands.lesson?.id === 'magic-text'
            ? 'Markdown'
            : 'Text'
          : 'JSON',
      'Requests',
      ...(commands.lesson?.id === 'local-models' ? ['Model'] : []),
      ...(commands.lesson?.id === 'javascript-runtime'
        ? ['Code', 'Runtime']
        : []),
      ...(['ui-kits', 'ui-chatbot'].includes(commands.lesson?.id ?? '')
        ? ['Kit', 'Schema']
        : []),
      ...(commands.lesson?.format === 'history'
        ? commands.lesson.id === 'agent-decisions'
          ? ['History', 'Agent']
          : ['json-parser', 'natural-forms'].includes(commands.lesson.id)
            ? [
                'History',
                'Parser',
                ...(commands.lesson.id === 'natural-forms' ? ['Form'] : []),
                'Schema',
              ]
            : ['server-threads', 'public-endpoint'].includes(commands.lesson.id)
              ? ['History', 'Server', 'Access']
              : ['History', 'Saved text']
        : []),
      ...(['structured', 'predictions', 'selection'].includes(
        commands.lesson?.format ?? '',
      )
        ? ['Schema']
        : []),
      ...(commands.lesson?.id === 'request-transformation'
        ? ['Transform']
        : []),
      ...(commands.lesson?.id === 'system-instructions'
        ? ['Instructions']
        : []),
      'UI',
      'State',
      ...(commands.lesson?.format === 'workflow'
        ? ['Activities', 'Interrupts']
        : []),
    ]
  ).map((name) => {
    const item = button(name, () => {
      tab = name;
      render();
    });
    item.id = `${instanceId}-tab-${name.toLowerCase()}`;
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-controls', tabPanel.id);
    return item;
  });
  tabs.append(...tabButtons);
  const inspectorTabs = createWorkbenchTabs(tabs, tabPanel);
  inspector.append(
    element('h2', 'Inspector', 'wb-panel-head'),
    tabs,
    selection,
    tabPanel,
  );
  const footer = element('section', '', 'wb-playback');
  footer.setAttribute('aria-label', 'Captured timeline');
  let rawEvents = false;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let speed = 1;
  // Commit of the capture loaded into an embedded replay.
  let recordedCommit: string | null = null;
  // Tells an embedding docs page that playback started or stopped.
  let playbackChanged: () => void = () => undefined;
  const startPlayback = () => {
    if (playing || !store.getSnapshot().events.length) return;
    playing = true;
    if (
      store.getSnapshot().cursor === null ||
      store.getSnapshot().cursor === store.getSnapshot().events.length - 1
    )
      store.seek(0);
    playbackChanged();
    schedule();
    render();
  };
  const play = iconButton('Play', 'play', () =>
    playing ? pause() : startPlayback(),
  );
  play.classList.add('wb-play');
  const returnLive = button('', () => {
    pause();
    store.live();
  });
  returnLive.className = 'wb-live';
  returnLive.setAttribute('aria-label', 'Return to live');
  returnLive.title = 'Return to live';
  const liveLabel = document.createTextNode('LIVE');
  returnLive.append(element('span', '', 'wb-live-dot'), liveLabel);
  const speedValue = element(
    'span',
    playbackSpeedLabel(speed),
    'wb-speed-value',
  );
  const speedButton = button('', () => {
    speed = nextPlaybackSpeed(speed);
    speedValue.textContent = playbackSpeedLabel(speed);
    if (playing) schedule();
  });
  speedButton.className = 'wb-speed';
  speedButton.append(
    element('span', 'Playback speed ', 'wb-visually-hidden'),
    speedValue,
  );
  const seek = element('input');
  seek.type = 'range';
  seek.min = '0';
  seek.setAttribute('aria-label', 'Seek captured event');
  seek.oninput = () => {
    pause();
    store.seek(Number(seek.value));
  };
  const timing = element('span', 'No captured events', 'wb-time wb-mono');
  const segments = element('div', '', 'wb-segments');
  const events = element('div', '', 'wb-events');
  const flag = element('span', '', 'wb-flag');
  flag.setAttribute('aria-hidden', 'true');
  const previous = iconButton('Previous event', 'previous-event', () => {
    pause();
    const snapshot = store.getSnapshot();
    store.seek(
      Math.max(0, (snapshot.cursor ?? snapshot.events.length - 1) - 1),
    );
  });
  const next = iconButton('Next event', 'next-event', () => {
    pause();
    const snapshot = store.getSnapshot();
    store.seek(
      Math.min(
        snapshot.events.length - 1,
        (snapshot.cursor ?? snapshot.events.length - 1) + 1,
      ),
    );
  });
  const jumpTurn = (direction: -1 | 1) => () => {
    pause();
    const snapshot = store.getSnapshot();
    const index = adjacentTurnIndex(
      snapshot.events,
      snapshot.cursor,
      direction,
    );
    if (index !== null) store.seek(index);
  };
  const previousTurn = iconButton(
    'Previous turn',
    'previous-turn',
    jumpTurn(-1),
  );
  const nextTurn = iconButton('Next turn', 'next-turn', jumpTurn(1));
  const rawToggle = iconButton('Raw events', 'raw-events', () => {
    rawEvents = !rawEvents;
    render();
  });
  rawToggle.setAttribute('aria-pressed', 'false');
  const transport = element('div', '', 'wb-transport');
  transport.append(previousTurn, previous, play, next, nextTurn);
  const scrubber = element('div', '', 'wb-scrubber');
  scrubber.append(segments, seek, events, flag);
  const detachScrub = attachWorkbenchScrub({
    track: scrubber,
    tickSelector: '.wb-events button',
    isDisabled: () => {
      const snapshot = store.getSnapshot();
      return snapshot.status === 'loading' || !snapshot.events.length;
    },
    indexAt: (fraction) => {
      const total = store.getSnapshot().events.length;
      return total ? Math.round(fraction * (total - 1)) : null;
    },
    onScrub: (index) => {
      pause();
      store.seek(index);
      // The range is pointer-transparent; keep keyboard follow-up on it.
      seek.focus({ preventScroll: true });
    },
  });
  const player = element('div', '', 'wb-player');
  player.append(
    transport,
    scrubber,
    timing,
    speedButton,
    rawToggle,
    returnLive,
  );
  footer.append(player);
  const shortcutTargets = {
    'toggle-play': play,
    'previous-event': previous,
    'next-event': next,
    'previous-turn': previousTurn,
    'next-turn': nextTurn,
    live: returnLive,
  } as const;
  function onShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || !root.isConnected) return;
    if (root.closest('[hidden]')) return;
    const shortcut = workbenchShortcut(event, event.target);
    if (!shortcut) return;
    if (shortcut === 'toggle-sidebar') {
      if (embed) return;
      event.preventDefault();
      layoutStore.set({ rail: !layoutStore.get().rail });
      return;
    }
    const target = shortcutTargets[shortcut];
    if (target.disabled) return;
    event.preventDefault();
    target.click();
  }
  document.addEventListener('keydown', onShortcut);
  const split = createWorkbenchSplit({ chat, inspector, layout: layoutStore });
  if (embed) layout.append(chat, split.element, inspector);
  else layout.append(nav, chat, split.element, inspector);
  root.append(header, layout, footer);
  host.append(root);
  function pause() {
    const wasPlaying = playing;
    playing = false;
    clearTimeout(timer);
    syncPlayButton();
    if (wasPlaying) playbackChanged();
  }
  function syncPlayButton() {
    const label = playing ? 'Pause' : 'Play';
    if (play.getAttribute('aria-label') === label) return;
    play.setAttribute('aria-label', label);
    play.title = label;
    play.replaceChildren(workbenchIcon(playing ? 'pause' : 'play'));
  }
  function schedule() {
    clearTimeout(timer);
    const snapshot = store.getSnapshot();
    const index = snapshot.cursor ?? 0;
    const next = snapshot.events[index + 1];
    if (!next) {
      pause();
      return;
    }
    timer = setTimeout(
      () => {
        if (!playing) return;
        store.seek(index + 1);
        schedule();
        render();
      },
      playbackDelay(
        snapshot.events[index]?.elapsedMs ?? 0,
        next.elapsedMs,
        speed,
      ),
    );
  }
  function render() {
    const snapshot = store.getSnapshot();
    const frame = snapshot.frame;
    const visibleEvents = snapshot.events.slice(
      0,
      (snapshot.cursor ?? snapshot.events.length - 1) + 1,
    );
    const sourceEvent = [...visibleEvents]
      .reverse()
      .find(
        (event) =>
          event.turn === (frame?.turn ?? snapshot.turn) &&
          event.kind === 'source' &&
          event.payload !== null &&
          typeof event.payload === 'object' &&
          'source' in event.payload &&
          (event.payload.source === 'provider' ||
            event.payload.source === 'test-fixture' ||
            event.payload.source === 'demo-failure'),
      );
    const payload = sourceEvent?.payload;
    const source =
      payload !== null && typeof payload === 'object' && 'source' in payload
        ? payload.source
        : undefined;
    provenance.textContent =
      commands.lesson?.id === 'local-models'
        ? 'Browser-local model'
        : commands.lesson?.id === 'javascript-runtime'
          ? 'Real QuickJS · no model'
          : commands.lesson?.id === 'agent-decisions' &&
              frame?.history?.agent?.fallback === 'unavailable' &&
              source === 'provider'
            ? 'Classifier unavailable'
            : source === 'demo-failure'
              ? 'Local demo failure'
              : source === 'test-fixture'
                ? 'Test fixture'
                : source === 'provider'
                  ? 'Live model'
                  : 'Awaiting source';
    const historical = snapshot.cursor !== null;
    // A recording that ended mid-run keeps a captured 'loading' status.
    const busy =
      (snapshot.status === 'loading' && !snapshot.readOnly) ||
      (snapshot.cursor === null && frame?.localModel?.state === 'preparing') ||
      isWorkbenchHistoryBusy(frame?.history?.sdk) ||
      !!frame?.history?.replacement ||
      !!frame?.history?.app.server?.busy;
    const blocked =
      busy ||
      (commands.lesson?.id === 'production-recovery' &&
        (!frame?.production ||
          frame.production.busy ||
          frame.production.attachedThreadId !== frame.production.threadId ||
          frame.production.disposition !== 'idle')) ||
      snapshot.status === 'paused' ||
      !!frame?.workflow?.recoveryRequired ||
      !!frame?.history?.sdk.pendingInterrupts ||
      !!frame?.history?.sdk.recoveryRequired;
    live.hidden = historical && !commands.managedChat;
    live.inert = historical && options.externalComposer === true;
    replay.hidden = !historical || !!commands.managedChat;
    prompt.disabled = historical || blocked;
    const server = frame?.history?.app.server;
    const serverLesson = commands.lesson?.id;
    const serverUnloaded =
      (serverLesson === 'server-threads' ||
        serverLesson === 'public-endpoint') &&
      (!server?.threadId ||
        server.access !== 'local-demo' ||
        server.threadId !==
          server.threads?.[serverLesson][server.selectedSlot]);
    send.disabled =
      historical ||
      blocked ||
      serverUnloaded ||
      (commands.lesson?.id === 'local-models' &&
        frame?.localModel?.state !== 'ready');
    stop.disabled = historical || !busy;
    denyCheckbox.disabled = historical || busy;
    denyCheckbox.checked = historical
      ? visibleEvents.some(
          (event) =>
            event.turn === frame?.turn &&
            event.kind === 'request' &&
            event.payload &&
            typeof event.payload === 'object' &&
            'url' in event.payload &&
            String(event.payload.url).includes('demoDenied=1'),
        )
      : debugDenied;
    const awaitingRecording =
      embed === 'replay' && (!snapshot.readOnly || !snapshot.events.length);
    if (embed === 'replay') form.hidden = true;
    first.disabled = historical || blocked;
    followup.disabled = historical || blocked;
    const statusText = awaitingRecording
      ? 'Waiting for recording'
      : embed === 'replay'
        ? recordedCommit
          ? `Recorded at ${recordedCommit.slice(0, 7)}`
          : 'Recorded'
        : `${historical ? 'Replay' : 'Live'} · ${frame?.status ?? snapshot.status}`;
    if (status.textContent !== statusText) status.textContent = statusText;
    replay.replaceChildren();
    if (historical && !commands.managedChat) {
      if (commands.lesson?.format === 'decision') {
        const plan = element('article', '', 'wb-summary');
        plan.setAttribute('aria-label', 'Application plan');
        const steps = element('ol');
        workbenchDecisionPlan.steps.forEach((step) =>
          steps.append(element('li', step)),
        );
        plan.append(
          element('span', 'Application-owned plan', 'wb-muted'),
          element('h2', workbenchDecisionPlan.title),
          steps,
        );
        replay.append(plan);
      }
      const messages = frame?.messages ?? [];
      for (const message of messages) {
        if (message.role === 'user') {
          replay.append(element('p', message.content, 'wb-user'));
          continue;
        }
        if (message.decision) {
          const card = element('article', '', 'wb-summary');
          card.setAttribute('aria-label', 'Captured decision');
          card.append(
            element('span', 'Closed choice · captured result', 'wb-muted'),
            element('h2', `Next action: ${message.decision.nextAction}`),
            element(
              'p',
              `Confidence: ${Math.round(message.decision.confidence * 100)}%`,
            ),
            element('p', 'Replay is read-only.', 'wb-muted'),
          );
          replay.append(card);
          continue;
        }
        if (options.plainTextReplay) {
          replay.append(element('p', message.content, 'wb-assistant'));
          continue;
        }
        const props = message.props;
        if (!props) continue;
        const card = element('article', '', 'wb-summary');
        card.append(
          element(
            'span',
            commands.lesson?.format === 'structured'
              ? 'Typed plan · captured preview'
              : `${message.uiComponent ?? 'SummaryCard'} · captured preview`,
            'wb-muted',
          ),
          element('h2', props.title ?? 'Waiting for title'),
        );
        const steps = element('ol');
        for (const step of props.steps ?? []) steps.append(element('li', step));
        card.append(steps, element('p', 'Replay is read-only.', 'wb-muted'));
        replay.append(card);
      }
    }
    inspectorTabs.sync(
      tabButtons.find((item) => item.textContent === tab)?.id ??
        tabButtons[0].id,
    );
    const onRequests = tab === 'Requests';
    const panelContent = onRequests ? requestsView.element : pair;
    if (tabPanel.firstElementChild !== panelContent)
      tabPanel.replaceChildren(panelContent);
    const onboardingText =
      commands.lesson?.id === 'conversation' ||
      commands.lesson?.id === 'system-instructions';
    const workflow = frame?.workflow;
    const outcome = frame?.status ?? snapshot.status;
    const applicationForm = readWorkflowForm(snapshot);
    const workflowView =
      commands.lesson?.format === 'workflow' && tab !== 'Requests'
        ? {
            heading:
              (
                {
                  Activities: 'SDK activities',
                  Interrupts: 'SDK pending interrupt batch',
                  State: 'Runtime shared state and SDK lifecycle',
                  UI: 'Application-owned workflow controls',
                  Text: 'Streamed text',
                } as Readonly<Record<string, string>>
              )[tab] ?? 'SDK workflow observation',
            value:
              tab === 'Activities'
                ? (workflow?.activities ?? [])
                : tab === 'Interrupts'
                  ? {
                      pending: workflow?.pendingInterrupts ?? null,
                      isResuming: workflow?.isResuming ?? false,
                      recoveryRequired: workflow?.recoveryRequired ?? false,
                    }
                  : tab === 'Text'
                    ? (workflow?.messages.filter(
                        (message) => message.role === 'assistant',
                      ) ?? [])
                    : tab === 'UI'
                      ? {
                          renderer: 'Application-owned workflow controls',
                          generatedComponents: false,
                          sdkFields: ['state', 'messages', 'pendingInterrupts'],
                        }
                      : {
                          state:
                            workflow?.productionState ??
                            workflow?.state ??
                            null,
                          ...(frame?.production
                            ? { serverApplication: frame.production }
                            : {}),
                          isLoading: workflow?.isLoading ?? false,
                          isResuming: workflow?.isResuming ?? false,
                          finishReason: workflow?.finishReason ?? null,
                          error: workflow?.error ?? null,
                          recoveryRequired: workflow?.recoveryRequired ?? false,
                        },
            detailHeading:
              (
                {
                  Activities: 'Validated progress and linked messages',
                  Interrupts: 'Application approval form and outcome',
                  State: 'Application form and accepted plan',
                  Text: 'Text rendering and request outcome',
                  UI: 'Selected SDK values for application controls',
                } as Readonly<Record<string, string>>
              )[tab] ?? 'Application interpretation',
            detail:
              tab === 'Activities'
                ? {
                    progress:
                      workflow?.activities.flatMap((message) =>
                        isWorkbenchWorkflowProgress(message.content)
                          ? [
                              {
                                id: message.id,
                                stage: message.content.stage,
                                label: message.content.label,
                                links:
                                  message.links ?? message.hashbrownLinks ?? {},
                              },
                            ]
                          : [],
                      ) ?? [],
                    outcome,
                  }
                : tab === 'Interrupts'
                  ? {
                      batchId: workflow?.pendingInterrupts?.id ?? null,
                      applicationForm,
                      outcome,
                      recoveryRequired: workflow?.recoveryRequired ?? false,
                    }
                  : tab === 'Text'
                    ? {
                        renderer: 'Plain text',
                        generatedComponents: false,
                        outcome,
                      }
                    : tab === 'UI'
                      ? {
                          state:
                            workflow?.productionState ??
                            workflow?.state ??
                            null,
                          ...(frame?.production
                            ? { serverApplication: frame.production }
                            : {}),
                          activityIds:
                            workflow?.activities.map((message) => message.id) ??
                            [],
                          pendingBatchId:
                            workflow?.pendingInterrupts?.id ?? null,
                          outcome,
                        }
                      : {
                          applicationForm,
                          acceptedApplication:
                            frame?.production?.application ??
                            frame?.application ??
                            snapshot.application,
                          ...(frame?.production
                            ? { recoveryOperation: frame.production }
                            : {}),
                          outcome,
                        },
          }
        : undefined;
    const history = frame?.history;
    const historyView =
      commands.lesson?.format === 'history' &&
      ['Text', 'UI', 'History', 'Saved text'].includes(tab)
        ? tab === 'Text'
          ? {
              heading: 'Selected SDK assistant text',
              value:
                history?.sdk.messages
                  .filter(
                    (message) =>
                      message['role'] === 'assistant' &&
                      typeof message['content'] === 'string',
                  )
                  .map((message) => message['content'])
                  .join('\n\n') ||
                'No assistant text in the selected SDK history.',
              detailHeading: 'Text rendering and request outcome',
              detail: {
                outcome,
                generatedProps: false,
                messageCount: history?.sdk.messages.length ?? 0,
              },
            }
          : tab === 'UI'
            ? {
                heading: 'Plain text renderer',
                value: {
                  renderer: 'Plain text',
                  generatedProps: false,
                  exposedComponents: [],
                },
                detailHeading: 'Application rendering boundary',
                detail: {
                  outcome,
                  note: 'Captured SDK text is rendered directly. This lesson exposes no generated UI components.',
                },
              }
            : tab === 'History'
              ? {
                  heading: 'Actual SDK transcript and lifecycle',
                  value: history?.sdk ?? null,
                  detailHeading: 'Application-retained text copy',
                  detail: {
                    retained: history?.app.retained ?? null,
                    action: history?.app.action ?? null,
                    replacementIntent: history?.replacement ?? null,
                    error: history?.app.error ?? null,
                  },
                }
              : {
                  heading: 'Last-read browser text document',
                  value: {
                    selectedSlot: history?.app.selectedSlot ?? null,
                    cachedRead: history?.app.saved ?? null,
                  },
                  detailHeading: 'Current operation and save eligibility',
                  detail: {
                    action: history?.app.action ?? null,
                    replacementIntent: history?.replacement ?? null,
                    error: history?.app.error ?? null,
                    canSave: canSaveWorkbenchHistory(snapshot),
                    successfulGeneration:
                      history?.successfulGeneration ?? false,
                    note: 'Cached explicit read; browser storage is origin-local and unencrypted. Do not store secrets.',
                  },
                }
        : undefined;
    const uiView = workbenchUiInspection(tab, snapshot, commands.lesson?.id);
    const recipeView =
      options.inspection?.(tab, snapshot) ??
      workbenchLocalInspection(tab, snapshot, commands.lesson?.id) ??
      workbenchJavaScriptInspection(tab, snapshot, commands.lesson?.id) ??
      uiView ??
      workbenchAuthoringInspection(tab, snapshot, commands.lesson?.id) ??
      workbenchServerInspection(tab, history?.app.server) ??
      historyView ??
      workflowView ??
      (onboardingText
        ? tab === 'UI'
          ? {
              heading: 'Plain text renderer',
              value: {
                renderer: 'Plain text',
                generatedProps: false,
                exposedComponents: [],
              },
              detailHeading: 'Text rendering and request outcome',
              detail: {
                content: frame?.json ?? '',
                outcome: frame?.status ?? snapshot.status,
                note: 'Assistant text is rendered directly without a UI schema or exposed components.',
              },
            }
          : undefined
        : workbenchRecipeInspection(snapshot, commands.lesson?.format, tab));
    capturedHeading.textContent =
      recipeView?.heading ??
      (tab === 'Instructions'
        ? 'Browser declaration and effective provider policy'
        : tab === 'Text'
          ? 'Streamed text'
          : tab === 'JSON'
            ? commands.lesson?.format === 'decision'
              ? 'Decision response'
              : 'Model output'
            : tab === 'Schema'
              ? 'Response contract'
              : tab === 'Transform'
                ? 'Mapped provider request'
                : tab === 'UI'
                  ? commands.lesson?.format === 'decision'
                    ? 'Application-owned choice'
                    : commands.lesson?.format === 'structured'
                      ? 'Application-rendered plan'
                      : 'Trusted component'
                  : tab === 'State'
                    ? 'Application state'
                    : 'Requests and tools');
    const selectedIndex = snapshot.cursor ?? snapshot.events.length - 1;
    selection.replaceChildren(
      element(
        'span',
        frame ? workbenchEventLabel(frame, commands.lesson?.format) : 'Live',
        'wb-chip wb-chip-active',
      ),
      element(
        'span',
        frame
          ? `Turn ${frame.turn} · ${frame.elapsedMs} ms · event ${selectedIndex + 1}/${snapshot.events.length}${historical ? '' : ' · live'}`
          : `Turn ${snapshot.turn} · live`,
      ),
      element('span', provenance.textContent, 'wb-chip'),
    );
    const requestContext =
      frame?.kind === 'request' ||
      frame?.kind === 'tool' ||
      frame?.kind === 'response'
        ? frame
        : ([...visibleEvents]
            .reverse()
            .find(
              (event) =>
                event.turn === (frame?.turn ?? snapshot.turn) &&
                event.kind === 'response' &&
                event.payload &&
                typeof event.payload === 'object' &&
                'status' in event.payload &&
                Number(event.payload.status) >= 400,
            ) ??
          [...visibleEvents]
            .reverse()
            .find(
              (event) =>
                event.turn === (frame?.turn ?? snapshot.turn) &&
                event.kind === 'tool',
            ) ??
          [...visibleEvents]
            .reverse()
            .find(
              (event) =>
                event.turn === (frame?.turn ?? snapshot.turn) &&
                event.kind === 'request',
            ));
    const browserPolicyObserved = visibleEvents.some((event) => {
      if (event.kind !== 'request' || event.turn !== frame?.turn) return false;
      const request = event.payload as {
        input?: { messages?: readonly { role?: string; content?: unknown }[] };
      } | null;
      return request?.input?.messages?.some(
        (message) =>
          message.role === 'system' &&
          message.content === workbenchBrowserInstructions,
      );
    });
    const transform = frame?.transformation;
    const transformFields = (
      value: NonNullable<typeof transform>['before'],
    ) => ({
      model: value.model,
      toolNames: value.toolNames,
      responseFormat:
        value.responseFormat &&
        typeof value.responseFormat === 'object' &&
        'type' in value.responseFormat
          ? value.responseFormat.type
          : value.responseFormat,
      store: value.store,
      maxOutputTokens: value.maxOutputTokens,
    });
    const value = recipeView
      ? recipeView.value
      : tab === 'Instructions'
        ? {
            browser: {
              origin: 'Browser configuration',
              policy: browserPolicyObserved
                ? workbenchBrowserInstructions
                : 'Waiting for the captured browser request',
            },
            effective:
              frame?.instructions ??
              'Waiting for the actual OpenAI adapter mapping callback',
          }
        : tab === 'Text'
          ? frame?.json || 'Waiting for text'
          : tab === 'Transform'
            ? transform
              ? {
                  before: transformFields(transform.before),
                  after: {
                    ...transformFields(transform.after),
                    addedInstructions:
                      transform.before.instructions &&
                      (transform.after.instructions ?? '').startsWith(
                        transform.before.instructions,
                      )
                        ? (transform.after.instructions ?? '')
                            .slice(transform.before.instructions.length)
                            .trim()
                        : transform.after.instructions,
                  },
                }
              : 'Waiting for the actual provider transformation callback'
            : tab === 'Schema'
              ? s.toJsonSchema(
                  getWorkbenchPlanSchema(
                    workbenchLessons.find(
                      (lesson) => lesson.id === commands.lesson?.id,
                    )?.id ?? 'schemas',
                  ),
                )
              : tab === 'JSON'
                ? frame?.json || 'Waiting for model output'
                : tab === 'UI'
                  ? commands.lesson?.format === 'decision'
                    ? {
                        renderer: 'Application-owned decision card',
                        generatedProps: false,
                      }
                    : commands.lesson?.format === 'structured'
                      ? {
                          renderer: 'Application-owned plan card',
                          fields: ['title', 'steps'],
                        }
                      : {
                          component: 'SummaryCard',
                          children: false,
                          inputs: {
                            title: 'string',
                            steps: 'streaming string[]',
                          },
                        }
                  : tab === 'State'
                    ? (frame?.application ?? snapshot.application)
                    : visibleEvents
                        .filter(
                          (event) =>
                            event.kind === 'request' || event.kind === 'tool',
                        )
                        .map((event) => ({
                          sequence: event.sequence,
                          turn: event.turn,
                          kind: event.kind,
                          payload: event.payload,
                        }));
    rawFrameToggle.setAttribute('aria-pressed', String(rawFrame));
    // In raw mode the section heading names the frame, so the body needs no second heading.
    if (rawFrame)
      capturedHeading.textContent = frame
        ? `${frame.kind} · ${frame.source}`
        : 'No selected event';
    capturedSub.textContent = rawFrame
      ? 'captured frame'
      : (frame?.status ?? snapshot.status) === 'loading'
        ? 'streaming'
        : 'captured';
    if (onRequests)
      requestsView.update({
        snapshot,
        busy,
        format: commands.lesson?.format,
        endpoint: commands.lesson?.endpoint,
        source: provenance.textContent ?? '',
      });
    // The pair is off-screen on the Requests tab; skip highlighting it.
    if (!onRequests)
      rebuildKeepingFocus(inspection, 'data-sequence', () => {
        inspection.replaceChildren();
        if (rawFrame) {
          inspection.append(
            pre(
              commands.lesson?.format === 'history'
                ? {
                    sdk: frame?.history?.sdk ?? null,
                    event: {
                      kind: frame?.kind,
                      source: frame?.source,
                      payload: frame?.payload,
                    },
                  }
                : commands.lesson?.format === 'workflow'
                  ? {
                      sdk: frame?.workflow ?? null,
                      event: {
                        kind: frame?.kind,
                        source: frame?.source,
                        payload: frame?.payload,
                      },
                    }
                  : tab === 'Transform' && transform
                    ? transform
                    : frame?.payload,
              tab,
            ),
          );
        } else {
          inspection.append(pre(value, tab));
        }
      });
    const detailHeader = element('header', '', 'wb-section-head');
    detailHeader.append(
      element(
        'h3',
        recipeView?.detailHeading ??
          (tab === 'Transform'
            ? 'Preserved mapped fields'
            : tab === 'Schema'
              ? 'Preview validation'
              : tab === 'JSON' || tab === 'UI'
                ? commands.lesson?.format === 'decision'
                  ? 'Typed choice and confidence'
                  : commands.lesson?.format === 'structured'
                    ? 'Typed plan'
                    : 'Resolved props'
                : tab === 'State'
                  ? 'Selected moment'
                  : requestContext?.kind === 'tool'
                    ? 'Browser tool result'
                    : 'Request payload'),
      ),
      element(
        'span',
        frame
          ? options.inspection
            ? 'Captured protocol and runtime observations.'
            : commands.lesson?.id === 'javascript-runtime'
              ? 'Captured native QuickJS values and application-owned state.'
              : uiView
                ? tab === 'UI'
                  ? 'SDK component observations and application-owned state.'
                  : 'Framework kit configuration and checked application policy.'
                : workflowView
                  ? 'Captured SDK observations and separately recorded application form drafts.'
                  : `Captured from ${tab === 'JSON' || tab === 'UI' ? 'SDK parsed output' : frame.source}.`
          : 'Waiting for captured data.',
        'wb-section-sub',
      ),
    );
    if (!onRequests)
      detail.replaceChildren(
        detailHeader,
        pre(
          recipeView
            ? recipeView.detail
            : tab === 'Transform'
              ? (transform?.preserved ?? null)
              : tab === 'Schema'
                ? {
                    preview: frame?.props ?? null,
                    passesApplicationRules: isWorkbenchPlan(frame?.props),
                    responseStatus: frame?.status ?? snapshot.status,
                    note: 'Preview values do not authorize applying a plan.',
                  }
                : tab === 'JSON' || tab === 'UI'
                  ? commands.lesson?.format === 'decision'
                    ? (frame?.decision ?? null)
                    : frame?.props
                  : tab === 'State'
                    ? {
                        turn: frame?.turn ?? snapshot.turn,
                        status: frame?.status ?? snapshot.status,
                        event: frame
                          ? workbenchEventLabel(frame, commands.lesson?.format)
                          : 'Ready',
                        source: frame?.source ?? 'Application',
                      }
                    : requestContext?.payload,
          tab,
        ),
      );
    const failed = (frame?.status ?? snapshot.status) === 'error';
    const issueText =
      commands.lesson?.format === 'workflow' &&
      frame?.workflow?.recoveryRequired
        ? 'Resume failed after acknowledgement. Start a new conversation.'
        : 'The request failed. Check the server, return to live, and send again.';
    if (failed && onRequests) {
      // The Requests view persists, so keep one alert node: inserting it again
      // on every render could announce it again.
      requestsIssue ??= element('p', issueText);
      requestsIssue.setAttribute('role', 'alert');
      if (requestsIssue.textContent !== issueText)
        requestsIssue.textContent = issueText;
      if (requestsIssue.parentElement !== requestsView.element)
        requestsView.element.append(requestsIssue);
    } else {
      requestsIssue?.remove();
      requestsIssue = undefined;
    }
    if (failed && !onRequests) {
      const issue = element('p', issueText);
      issue.setAttribute('role', 'alert');
      inspection.append(issue);
    }
    rawToggle.setAttribute('aria-pressed', String(rawEvents));
    const total = snapshot.events.length;
    const milestones = rawEvents
      ? withWorkbenchMilestoneIds(
          snapshot.events.map((event, index) => ({
            index,
            turn: event.turn,
            label: workbenchEventLabel(event, commands.lesson?.format),
          })),
        )
      : workbenchMilestones(snapshot.events, commands.lesson?.format);
    const activeMilestone = milestones
      .filter((item) => item.index <= selectedIndex)
      .at(-1);
    rebuildKeepingFocus(events, 'data-index', () => {
      events.replaceChildren();
      milestones.forEach(({ index, label, id }) => {
        const event = snapshot.events[index];
        const item = button(label, () => {
          pause();
          store.seek(index);
        });
        item.disabled = busy;
        item.dataset.index = String(index);
        item.dataset.milestone = id;
        item.style.left = `${workbenchTickPercent(index, total)}%`;
        item.setAttribute(
          'aria-label',
          `${label}. Turn ${event.turn}, event ${index + 1}: ${event.kind}, ${event.elapsedMs} milliseconds`,
        );
        item.setAttribute(
          'aria-pressed',
          String(index === activeMilestone?.index),
        );
        item.toggleAttribute('data-at-playhead', index === selectedIndex);
        events.append(item);
      });
    });
    segments.replaceChildren(
      ...workbenchTurnSegments(snapshot.events).map(({ turn, start, end }) => {
        const segment = element('div', '', 'wb-segment');
        const left = workbenchTickPercent(start, total);
        segment.style.left = `${left}%`;
        segment.style.width = `${workbenchTickPercent(end, total) - left}%`;
        segment.style.setProperty(
          '--wb-fill',
          `${workbenchSegmentFill({ start, end }, selectedIndex, total)}%`,
        );
        segment.append(element('span', `Turn ${turn}`, 'wb-mono'));
        return segment;
      }),
    );
    flag.textContent = total ? (activeMilestone?.label ?? '') : '';
    const flagPercent = workbenchTickPercent(selectedIndex, total);
    flag.style.left = total ? `${flagPercent}%` : '';
    const anchor = workbenchFlagAnchor(flagPercent);
    if (total && anchor !== 'middle') flag.dataset.anchor = anchor;
    else delete flag.dataset.anchor;
    previous.disabled = busy || selectedIndex <= 0;
    next.disabled = busy || selectedIndex >= total - 1;
    previousTurn.disabled =
      busy || adjacentTurnIndex(snapshot.events, snapshot.cursor, -1) === null;
    nextTurn.disabled =
      busy || adjacentTurnIndex(snapshot.events, snapshot.cursor, 1) === null;
    seek.max = String(Math.max(0, total - 1));
    seek.value = String(snapshot.cursor ?? total - 1);
    seek.disabled = busy || !total;
    seek.setAttribute(
      'aria-valuetext',
      frame
        ? `Turn ${frame.turn} · Event ${selectedIndex + 1} of ${total} · ${activeMilestone?.label ?? workbenchEventLabel(frame, commands.lesson?.format)} · ${formatPlaybackSeconds(frame.elapsedMs)}`
        : 'No captured events',
    );
    play.disabled = busy || total < 2;
    syncPlayButton();
    returnLive.disabled = !historical;
    returnLive.toggleAttribute('data-live', !historical);
    liveLabel.data = historical ? 'Return to live' : 'LIVE';
    const last = snapshot.events.at(-1);
    timing.textContent =
      frame && last
        ? `${formatPlaybackSeconds(frame.elapsedMs)} / ${formatPlaybackSeconds(last.elapsedMs)}`
        : 'No captured events';
    queueMicrotask(() => {
      if (historical) replay.scrollTop = replay.scrollHeight;
      else if (following) live.scrollTop = live.scrollHeight;
    });
  }
  renderLayout();
  const unsubscribeLayout = layoutStore.subscribe(renderLayout);
  const unsubscribe = store.subscribe(render);
  render();
  const lessonId = commands.lesson?.id;
  const captureLesson =
    workbenchLessons.find((lesson) => lesson.id === lessonId)?.id ??
    getWorkbenchLesson(globalThis.location?.search ?? '').id;
  const captureFramework =
    commands.framework.toLowerCase() === 'angular' ? 'angular' : 'react';
  const captureSource = {
    root,
    capture: (recordedAt: string) =>
      createWorkbenchCapture(store.getSnapshot(), {
        lesson: captureLesson,
        framework: captureFramework,
        recordedAt,
      }),
  };
  captureSources.push(captureSource);
  exposeWorkbenchCapture();
  const messages = embed
    ? attachWorkbenchMessages({
        mode: embed,
        lesson: captureLesson,
        framework: captureFramework,
        format: commands.lesson?.format,
        store,
        isPlaying: () => playing,
        play: startPlayback,
        pause,
        loaded: (commit) => {
          recordedCommit = commit;
          render();
        },
      })
    : null;
  if (messages) playbackChanged = messages.playbackChanged;
  return {
    live,
    pause,
    navigation: (value) => {
      navigation = value;
      renderNavigation();
    },
    dispose: () => {
      const captureIndex = captureSources.indexOf(captureSource);
      if (captureIndex >= 0) captureSources.splice(captureIndex, 1);
      exposeWorkbenchCapture();
      messages?.dispose();
      detachScrub();
      requestsView.dispose();
      inspectorTabs.dispose();
      pause();
      document.removeEventListener('keydown', onShortcut);
      unsubscribe();
      unsubscribeLayout();
      split.dispose();
      root.remove();
    },
  };
}
