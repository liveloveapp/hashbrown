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
): string {
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
      TEXT_MESSAGE_START: 'JSON start',
      TEXT_MESSAGE_CONTENT: 'JSON chunk',
      TEXT_MESSAGE_END: 'JSON end',
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

/** Mounts a shared accessible shell, leaving live rendering entirely to the framework. */
export function mountWorkbench(
  host: HTMLElement,
  store: WorkbenchStore,
  commands: WorkbenchCommands,
): {
  readonly live: HTMLElement;
  readonly dispose: () => void;
  readonly pause: () => void;
  readonly navigation: (value: WorkbenchNavigation) => void;
} {
  const instanceId = crypto.randomUUID();
  let navigation: WorkbenchNavigation | undefined;
  const root = element('main', '', 'wb');
  const header = element('header', '', 'wb-header');
  header.append(
    element('strong', 'Hashbrown'),
    element('span', 'Conversation workbench'),
    element('span', commands.framework, 'wb-muted'),
  );
  const provenance = element('span', 'Awaiting source', 'wb-muted');
  provenance.dataset.source = '';
  header.append(provenance);
  const layout = element('div', '', 'wb-layout');
  const nav = element('nav', '', 'wb-nav');
  nav.setAttribute('aria-label', 'Examples and conversations');
  function renderNavigation() {
    nav.replaceChildren(
      element('h2', 'Examples'),
      element('p', 'Generative UI'),
      element('h2', 'Conversations'),
    );
    for (const item of navigation?.conversations ?? [
      { id: 'default', label: 'Two-step plan' },
    ]) {
      const select = button(item.label, () => {
        pause();
        if (navigation) navigation.select(item.id);
        else store.live();
      });
      select.setAttribute(
        'aria-pressed',
        String(item.id === (navigation?.currentId ?? 'default')),
      );
      nav.append(select);
    }
    nav.append(
      button('New conversation', () => {
        pause();
        if (navigation) navigation.create();
        else {
          commands.reset();
          store.clear();
          prompt.value = workbenchPrompts[0];
        }
      }),
    );
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
  prompt.value = workbenchPrompts[0];
  prompt.rows = 2;
  const actions = element('div', '', 'wb-actions');
  const send = element('button', 'Send', 'wb-primary');
  send.type = 'submit';
  send.dataset.send = '';
  const stop = button('Stop', commands.stop);
  const first = button('First prompt', () => {
    prompt.value = workbenchPrompts[0];
    prompt.focus();
  });
  const followup = button('Follow-up', () => {
    prompt.value = workbenchPrompts[1];
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
  chat.append(chatHeader, live, replay, form);
  const inspector = element('section', '', 'wb-panel wb-inspector');
  inspector.setAttribute('aria-label', 'Inspector');
  const tabs = element('div', '', 'wb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Inspector views');
  const inspection = element('div', '', 'wb-inspection');
  inspection.id = `${instanceId}-inspection`;
  inspection.setAttribute('role', 'tabpanel');
  let tab = 'JSON';
  const tabButtons = ['JSON', 'Requests', 'UI', 'State'].map((name) => {
    const item = button(name, () => {
      tab = name;
      render();
    });
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-controls', inspection.id);
    return item;
  });
  tabs.append(...tabButtons);
  inspector.append(
    element('h2', 'Inspector', 'wb-panel-head'),
    tabs,
    inspection,
  );
  const detail = element('aside', '', 'wb-panel wb-detail');
  detail.setAttribute('aria-label', 'Event details and console');
  let drawer = 'Details';
  const footer = element('section', '', 'wb-playback');
  footer.setAttribute('aria-label', 'Captured timeline');
  const controls = element('div', '', 'wb-actions');
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
  controls.append(play, previous, next, returnLive, turns, rate, timing);
  footer.append(
    controls,
    events,
    seek,
    element(
      'p',
      'Recorded session events · Playback pauses are capped at 1.2 seconds.',
      'wb-muted',
    ),
  );
  layout.append(nav, chat, inspector, detail);
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
    const sourceEvent = [...snapshot.events]
      .reverse()
      .find(
        (event) =>
          event.kind === 'source' &&
          event.payload !== null &&
          typeof event.payload === 'object' &&
          'source' in event.payload &&
          (event.payload.source === 'provider' ||
            event.payload.source === 'test-fixture'),
      );
    const payload = sourceEvent?.payload;
    const source =
      payload !== null && typeof payload === 'object' && 'source' in payload
        ? payload.source
        : undefined;
    provenance.textContent =
      source === 'test-fixture'
        ? 'Test fixture'
        : source === 'provider'
          ? 'Live model'
          : 'Awaiting source';
    const historical = snapshot.cursor !== null;
    const busy = snapshot.status === 'loading';
    live.hidden = historical;
    replay.hidden = !historical;
    prompt.disabled = historical || busy;
    send.disabled = historical || busy;
    stop.disabled = historical || !busy;
    first.disabled = historical || busy;
    followup.disabled = historical || busy;
    status.textContent = `${historical ? 'Replay' : 'Live'} · ${frame?.status ?? snapshot.status}`;
    replay.replaceChildren();
    if (historical) {
      const messages = frame?.messages ?? [];
      for (const message of messages) {
        if (message.role === 'user') {
          replay.append(element('p', message.content, 'wb-user'));
          continue;
        }
        const props = message.props;
        if (!props) continue;
        const card = element('article', '', 'wb-summary');
        card.append(
          element('span', 'SummaryCard · captured preview', 'wb-muted'),
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
    inspection.replaceChildren(
      element(
        'h3',
        `${tab} · ${historical ? 'selected event' : 'latest event'}`,
      ),
    );
    const visibleEvents = snapshot.events.slice(
      0,
      (snapshot.cursor ?? snapshot.events.length - 1) + 1,
    );
    const value =
      tab === 'JSON'
        ? frame?.json || 'Waiting for model output'
        : tab === 'UI'
          ? { component: 'SummaryCard', props: frame?.props ?? null }
          : tab === 'State'
            ? (frame?.application ?? snapshot.application)
            : visibleEvents
                .filter(
                  (event) => event.kind === 'request' || event.kind === 'tool',
                )
                .map((event) => ({
                  sequence: event.sequence,
                  turn: event.turn,
                  kind: event.kind,
                  payload: event.payload,
                }));
    inspection.append(pre(value));
    const drawerTabs = element('div', '', 'wb-tabs');
    drawerTabs.setAttribute('role', 'tablist');
    drawerTabs.setAttribute('aria-label', 'Context views');
    const drawerBody = element('div', '', 'wb-inspection');
    drawerBody.setAttribute('role', 'tabpanel');
    ['Details', 'Raw', 'Console'].forEach((name) => {
      const item = button(name, () => {
        drawer = name;
        render();
      });
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(drawer === name));
      drawerTabs.append(item);
    });
    detail.replaceChildren(
      element('h2', 'Context', 'wb-panel-head'),
      element(
        'p',
        `Turn ${frame?.turn ?? snapshot.turn} · ${historical ? 'selected event' : 'live'} · ${tab}`,
        'wb-scope',
      ),
      drawerTabs,
      drawerBody,
    );
    if (drawer === 'Console') {
      const logs = element('ol', '', 'wb-logs');
      visibleEvents.slice(-20).forEach((event) => {
        const item = element('li');
        item.append(
          button(
            `${event.elapsedMs} ms · ${workbenchEventLabel(event)}`,
            () => {
              pause();
              store.seek(snapshot.events.indexOf(event));
            },
          ),
        );
        logs.append(item);
      });
      drawerBody.append(logs);
    } else if (drawer === 'Raw') {
      drawerBody.append(
        element(
          'h3',
          frame ? `${frame.kind} · ${frame.source}` : 'No selected event',
        ),
        pre(frame?.payload),
      );
    } else {
      drawerBody.append(
        element(
          'h3',
          tab === 'JSON' || tab === 'UI'
            ? 'Resolved props'
            : tab === 'State'
              ? 'Application snapshot'
              : 'Captured requests and tool results',
        ),
        pre(
          tab === 'JSON' || tab === 'UI'
            ? frame?.props
            : tab === 'State'
              ? (frame?.application ?? snapshot.application)
              : value,
        ),
        element(
          'p',
          frame
            ? `Captured from ${tab === 'JSON' || tab === 'UI' ? 'SDK parsed output' : frame.source}.`
            : 'Waiting for captured data.',
          'wb-muted',
        ),
      );
    }
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
    snapshot.events.forEach((event, index) => {
      let row = rows.get(event.turn);
      if (!row) {
        row = element('div', '', 'wb-timeline-row');
        row.append(element('span', `Turn ${event.turn}`, 'wb-mono'));
        rows.set(event.turn, row);
        events.append(row);
      }
      const item = button(workbenchEventLabel(event), () => {
        pause();
        store.seek(index);
      });
      item.disabled = busy;
      item.setAttribute(
        'aria-label',
        `Turn ${event.turn}, event ${index + 1}: ${event.kind}, ${event.elapsedMs} milliseconds`,
      );
      item.setAttribute(
        'aria-pressed',
        String(index === (snapshot.cursor ?? snapshot.events.length - 1)),
      );
      row.append(item);
    });
    const selectedIndex = snapshot.cursor ?? snapshot.events.length - 1;
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
      root.remove();
    },
  };
}
