import { s } from '@hashbrownai/core';
import {
  getWorkbenchPlanSchema,
  workbenchDecisionPlan,
  workbenchDecisionPrompts,
} from './workbench';
import { workbenchLayout, type WorkbenchLayoutStore } from './workbench-layout';
import {
  type WorkbenchLesson,
  type WorkbenchLessonId,
  workbenchLessons,
} from './workbench-lessons';
import { renderWorkbenchSidebar } from './workbench-sidebar';
import { createWorkbenchSplit } from './workbench-split';
import { workbenchRecipePrompts } from './workbench-recipes';
import {
  workbenchRecipeEventLabel,
  workbenchRecipeInspection,
} from './workbench-recipe-view';
import { workbenchMilestones } from './workbench-timeline';
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
function pre(value: unknown): HTMLPreElement {
  return element(
    'pre',
    typeof value === 'string'
      ? value
      : (JSON.stringify(value, null, 2) ?? 'Waiting for captured data'),
  );
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
      RUN_FINISHED: 'Run finished',
      RUN_ERROR: 'Run failed',
      TOOL_CALL_START: 'Call tool',
      TOOL_CALL_ARGS: 'Tool arguments',
      TOOL_CALL_END: 'Tool ready',
      TEXT_MESSAGE_START: format === 'text' ? 'Text start' : 'JSON start',
      TEXT_MESSAGE_CONTENT: format === 'text' ? 'Text chunk' : 'JSON chunk',
      TEXT_MESSAGE_END: format === 'text' ? 'Text end' : 'JSON end',
      DECISION_RESPONSE: 'Decision response',
    };
    return names[String(event.payload.type)] ?? String(event.payload.type);
  }
  return (
    {
      event: 'Stream event',
      user: 'Prompt',
      request: 'Request',
      tool: 'Tool result',
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
    }[event.kind] ?? event.kind
  );
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
  const layoutStore = options.layout ?? workbenchLayout;
  const debugging = commands.lesson?.id === 'debugging';
  let debugDenied = debugging;
  const recipePrompts =
    commands.lesson && Object.hasOwn(workbenchRecipePrompts, commands.lesson.id)
      ? workbenchRecipePrompts[
          commands.lesson.id as keyof typeof workbenchRecipePrompts
        ]
      : undefined;
  const prompts =
    recipePrompts ??
    (commands.lesson?.format === 'decision'
      ? workbenchDecisionPrompts
      : workbenchPrompts);
  let navigation: WorkbenchNavigation | undefined;
  const root = element('main', '', 'wb');
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
  function renderNavigation() {
    const current = layoutStore.get();
    root.classList.toggle('wb-rail', current.rail);
    layout.style.setProperty('--wb-split', String(current.split));
    layout.style.setProperty('--wb-chat', `${current.split}fr`);
    layout.style.setProperty('--wb-inspector', `${100 - current.split}fr`);
    renderWorkbenchSidebar(nav, {
      framework: commands.framework,
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
  }
  const chat = element('section', '', 'wb-chat wb-panel');
  chat.setAttribute('aria-label', 'Conversation');
  const chatHeader = element('div', '', 'wb-panel-head');
  const status = element('span', 'Ready', 'wb-muted');
  chatHeader.append(element('h1', 'A plan, built together'), status);
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
  form.onsubmit = (event) => {
    event.preventDefault();
    const snapshot = store.getSnapshot();
    if (
      snapshot.cursor !== null ||
      snapshot.status === 'loading' ||
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
    form,
  );
  const inspector = element('section', '', 'wb-panel wb-inspector');
  inspector.setAttribute('aria-label', 'Inspector');
  const tabs = element('div', '', 'wb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Inspector views');
  const selection = element('div', '', 'wb-selection');
  const pair = element('div', '', 'wb-pair');
  pair.id = `${instanceId}-inspection`;
  pair.setAttribute('role', 'tabpanel');
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
  const tabButtons = [
    commands.lesson?.format === 'text' ? 'Markdown' : 'JSON',
    'Requests',
    ...(['structured', 'predictions', 'selection'].includes(
      commands.lesson?.format ?? '',
    )
      ? ['Schema']
      : []),
    ...(commands.lesson?.id === 'request-transformation' ? ['Transform'] : []),
    'UI',
    'State',
  ].map((name) => {
    const item = button(name, () => {
      tab = name;
      render();
    });
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-controls', pair.id);
    return item;
  });
  tabs.append(...tabButtons);
  inspector.append(
    element('h2', 'Inspector', 'wb-panel-head'),
    tabs,
    selection,
    pair,
  );
  const footer = element('section', '', 'wb-playback');
  footer.setAttribute('aria-label', 'Captured timeline');
  const controls = element('div', '', 'wb-actions');
  let rawEvents = false;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let speed = 1;
  const play = button('Play', () => {
    if (playing) {
      pause();
      return;
    }
    if (!store.getSnapshot().events.length) return;
    playing = true;
    if (
      store.getSnapshot().cursor === null ||
      store.getSnapshot().cursor === store.getSnapshot().events.length - 1
    )
      store.seek(0);
    schedule();
    render();
  });
  const returnLive = button('Return to live', () => {
    pause();
    store.live();
  });
  const rate = element('select');
  rate.setAttribute('aria-label', 'Playback speed');
  [0.5, 1, 2].forEach((value) => {
    const option = element('option', `${value}×`);
    option.value = String(value);
    rate.append(option);
  });
  rate.value = '1';
  rate.onchange = () => {
    speed = Number(rate.value);
    if (playing) schedule();
  };
  const seek = element('input');
  seek.type = 'range';
  seek.min = '0';
  seek.setAttribute('aria-label', 'Seek captured event');
  seek.oninput = () => {
    pause();
    store.seek(Number(seek.value));
  };
  const timing = element('span', 'No captured events', 'wb-mono');
  const events = element('div', '', 'wb-events');
  const previous = button('Previous event', () => {
    pause();
    const snapshot = store.getSnapshot();
    store.seek(
      Math.max(0, (snapshot.cursor ?? snapshot.events.length - 1) - 1),
    );
  });
  const next = button('Next event', () => {
    pause();
    const snapshot = store.getSnapshot();
    store.seek(
      Math.min(
        snapshot.events.length - 1,
        (snapshot.cursor ?? snapshot.events.length - 1) + 1,
      ),
    );
  });
  const turns = element('select');
  turns.setAttribute('aria-label', 'Conversation turn');
  turns.onchange = () => {
    pause();
    const index = store
      .getSnapshot()
      .events.findIndex((event) => event.turn === Number(turns.value));
    if (index >= 0) store.seek(index);
  };
  const rawToggle = button('Raw events', () => {
    rawEvents = !rawEvents;
    render();
  });
  rawToggle.setAttribute('aria-pressed', 'false');
  controls.append(
    play,
    previous,
    next,
    returnLive,
    turns,
    rate,
    rawToggle,
    timing,
  );
  footer.append(controls, events, seek);
  const split = createWorkbenchSplit({ chat, inspector, layout: layoutStore });
  layout.append(nav, chat, split.element, inspector);
  root.append(header, layout, footer);
  host.append(root);
  function pause() {
    playing = false;
    clearTimeout(timer);
    play.textContent = 'Play';
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
      source === 'demo-failure'
        ? 'Local demo failure'
        : source === 'test-fixture'
          ? 'Test fixture'
          : source === 'provider'
            ? 'Live model'
            : 'Awaiting source';
    const historical = snapshot.cursor !== null;
    const busy = snapshot.status === 'loading';
    live.hidden = historical && !commands.managedChat;
    replay.hidden = !historical || !!commands.managedChat;
    prompt.disabled = historical || busy;
    send.disabled = historical || busy;
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
    first.disabled = historical || busy;
    followup.disabled = historical || busy;
    status.textContent = `${historical ? 'Replay' : 'Live'} · ${frame?.status ?? snapshot.status}`;
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
        const props = message.props;
        if (!props) continue;
        const card = element('article', '', 'wb-summary');
        card.append(
          element(
            'span',
            commands.lesson?.format === 'structured'
              ? 'Typed plan · captured preview'
              : 'SummaryCard · captured preview',
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
    tabButtons.forEach((item) =>
      item.setAttribute('aria-selected', String(item.textContent === tab)),
    );
    const recipeView = workbenchRecipeInspection(
      snapshot,
      commands.lesson?.format,
      tab,
    );
    capturedHeading.textContent =
      recipeView?.heading ??
      (tab === 'JSON'
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
          ? `Turn ${frame.turn} · ${frame.elapsedMs} ms · event ${selectedIndex + 1}/${snapshot.events.length}`
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
                      inputs: { title: 'string', steps: 'streaming string[]' },
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
    capturedSub.textContent = rawFrame
      ? 'captured frame'
      : (frame?.status ?? snapshot.status) === 'loading'
        ? 'streaming'
        : 'captured';
    inspection.replaceChildren();
    if (rawFrame) {
      inspection.append(
        element(
          'h3',
          frame ? `${frame.kind} · ${frame.source}` : 'No selected event',
        ),
        pre(tab === 'Transform' && transform ? transform : frame?.payload),
      );
    } else if (tab === 'Requests') {
      const list = element('div', '', 'wb-request-list');
      for (const event of visibleEvents.filter(
        (event) =>
          event.kind === 'request' ||
          event.kind === 'tool' ||
          (event.kind === 'response' &&
            event.payload &&
            typeof event.payload === 'object' &&
            'status' in event.payload &&
            Number(event.payload.status) >= 400),
      )) {
        const item = button(
          `${event.kind === 'response' ? workbenchEventLabel(event, commands.lesson?.format) : event.kind === 'tool' ? 'readContext' : ['decision', 'selection'].includes(commands.lesson?.format ?? '') ? 'Decision request' : 'Model request'} · turn ${event.turn}`,
          () => {
            pause();
            store.seek(snapshot.events.indexOf(event));
          },
        );
        item.disabled = busy;
        item.setAttribute(
          'aria-pressed',
          String(frame?.sequence === event.sequence),
        );
        list.append(item);
      }
      inspection.append(
        list.childElementCount
          ? list
          : element('p', 'Send a message to follow its requests.', 'wb-muted'),
      );
    } else {
      inspection.append(pre(value));
    }
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
          ? `Captured from ${tab === 'JSON' || tab === 'UI' ? 'SDK parsed output' : frame.source}.`
          : 'Waiting for captured data.',
        'wb-section-sub',
      ),
    );
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
      ),
    );
    if ((frame?.status ?? snapshot.status) === 'error') {
      const issue = element(
        'p',
        'The request failed. Check the server, return to live, and send again.',
      );
      issue.setAttribute('role', 'alert');
      inspection.append(issue);
    }
    events.replaceChildren();
    const rows = new Map<number, HTMLElement>();
    rawToggle.setAttribute('aria-pressed', String(rawEvents));
    const milestones = rawEvents
      ? snapshot.events.map((event, index) => ({
          index,
          turn: event.turn,
          label: workbenchEventLabel(event, commands.lesson?.format),
        }))
      : workbenchMilestones(snapshot.events, commands.lesson?.format);
    const activeMilestone = milestones
      .filter((item) => item.index <= selectedIndex)
      .at(-1)?.index;
    milestones.forEach(({ index, label }) => {
      const event = snapshot.events[index];
      let row = rows.get(event.turn);
      if (!row) {
        row = element('div', '', 'wb-timeline-row');
        row.append(element('span', `Turn ${event.turn}`, 'wb-mono'));
        rows.set(event.turn, row);
        events.append(row);
      }
      const item = button(label, () => {
        pause();
        store.seek(index);
      });
      item.disabled = busy;
      item.setAttribute(
        'aria-label',
        `${label}. Turn ${event.turn}, event ${index + 1}: ${event.kind}, ${event.elapsedMs} milliseconds`,
      );
      item.setAttribute('aria-pressed', String(index === activeMilestone));
      row.append(item);
    });
    previous.disabled = busy || selectedIndex <= 0;
    next.disabled = busy || selectedIndex >= snapshot.events.length - 1;
    turns.replaceChildren();
    [...new Set(snapshot.events.map((event) => event.turn))].forEach((turn) => {
      const option = element('option', `Turn ${turn}`);
      option.value = String(turn);
      turns.append(option);
    });
    turns.value = String(frame?.turn ?? snapshot.turn);
    turns.disabled = busy || !snapshot.events.length;
    seek.max = String(Math.max(0, snapshot.events.length - 1));
    seek.value = String(snapshot.cursor ?? snapshot.events.length - 1);
    seek.disabled = busy || !snapshot.events.length;
    play.disabled = busy || snapshot.events.length < 2;
    play.textContent = playing ? 'Pause' : 'Play';
    timing.textContent = frame
      ? `${frame.elapsedMs} ms · event ${(snapshot.cursor ?? snapshot.events.length - 1) + 1} / ${snapshot.events.length}`
      : 'No captured events';
    queueMicrotask(() => {
      if (historical) replay.scrollTop = replay.scrollHeight;
      else if (following) live.scrollTop = live.scrollHeight;
    });
  }
  renderNavigation();
  const unsubscribeLayout = layoutStore.subscribe(renderNavigation);
  const unsubscribe = store.subscribe(render);
  render();
  return {
    live,
    pause,
    navigation: (value) => {
      navigation = value;
      renderNavigation();
    },
    dispose: () => {
      pause();
      unsubscribe();
      unsubscribeLayout();
      split.dispose();
      root.remove();
    },
  };
}
