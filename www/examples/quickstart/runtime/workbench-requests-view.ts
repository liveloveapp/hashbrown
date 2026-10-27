import type { WorkbenchFrame, WorkbenchSnapshot } from './workbench';
import { renderWorkbenchCode } from './workbench-highlight';
import {
  type WorkbenchExchange,
  workbenchExchanges,
  type WorkbenchTurnExchanges,
} from './workbench-requests';
import { workbenchActiveAxis } from './workbench-requests-axis';
import { createWorkbenchRequestsTimeline } from './workbench-requests-timeline';

/** What the Requests view renders on each store change. */
export interface WorkbenchRequestsViewInput {
  readonly snapshot: WorkbenchSnapshot;
  /** True while a response is loading; seeking is disabled. */
  readonly busy: boolean;
  /** The lesson format; decision lessons name their rows differently. */
  readonly format?: string;
  /** The lesson's configured endpoint, for requests that carry no URL. */
  readonly endpoint?: string;
  /** The provenance label, such as "Live model". */
  readonly source: string;
}

/** The inspector's Requests tab: overview timeline, table and detail pane. */
export interface WorkbenchRequestsView {
  /** The `.wb-inspection` container that wraps everything. */
  readonly element: HTMLElement;
  update(input: WorkbenchRequestsViewInput): void;
  readonly dispose: () => void;
}

/** Collaborators for {@link createWorkbenchRequestsView}. */
export interface WorkbenchRequestsViewOptions {
  /** Prefixes element ids so retained instances stay unique. */
  readonly instanceId: string;
  /** Pauses playback and moves the store cursor to an event index. */
  readonly seek: (index: number) => void;
}

interface Row {
  readonly tr: HTMLTableRowElement;
  readonly button: HTMLButtonElement;
  readonly compact: HTMLSpanElement;
  readonly type: HTMLSpanElement;
  readonly status: HTMLTableCellElement;
  readonly start: HTMLTableCellElement;
  readonly duration: HTMLTableCellElement;
  readonly count: HTMLTableCellElement;
  readonly bar: HTMLSpanElement;
}

interface Group {
  readonly tbody: HTMLTableSectionElement;
  readonly heading: HTMLTableCellElement;
}

interface DetailTab {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
}

const columns = [
  'Name',
  'Type',
  'Status',
  'Start',
  'Duration',
  'Events',
  'Waterfall',
] as const;

type Tone = 'ok' | 'error' | 'pending' | 'cancelled';

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

function button(
  text: string,
  className: string,
  action: () => void,
): HTMLButtonElement {
  const node = element('button', text, className);
  node.type = 'button';
  node.onclick = action;
  return node;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const truncate = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

const ms = (value: number) => `${Math.round(value)} ms`;

/** JSON through the shared highlighter, pretty-printed. */
function code(value: unknown, className = ''): HTMLPreElement {
  const block = element('pre', '', className);
  block.dataset.language = 'json';
  block.append(
    renderWorkbenchCode(JSON.stringify(value ?? null, null, 2), 'json'),
  );
  return block;
}

/**
 * Rebuilds `container` and, when focus was on one of its keyed children and
 * the rebuild lost it (the node was replaced, or moved and blurred), moves
 * focus back to the child with the same key and tag (a row and its button
 * share a key; focus belongs on the button).
 */
function rebuildKeepingFocus(
  container: HTMLElement,
  key: string,
  rebuild: () => void,
): void {
  const active = container.ownerDocument.activeElement;
  const keyed =
    active instanceof HTMLElement && container.contains(active)
      ? active.closest<HTMLElement>(`[${key}]`)
      : null;
  const restore = keyed?.getAttribute(key);
  rebuild();
  if (restore == null || !keyed) return;
  if (container.ownerDocument.activeElement === keyed) return;
  const target = keyed.isConnected
    ? keyed
    : [...container.querySelectorAll<HTMLElement>(`[${key}]`)].find(
        (node) =>
          node.getAttribute(key) === restore && node.tagName === keyed.tagName,
      );
  target?.focus();
}

/** Puts `nodes` in order under `parent`, moving only nodes out of place. */
function syncChildren(parent: Element, nodes: readonly Element[]): void {
  nodes.forEach((node, index) => {
    const at = parent.children[index];
    if (at !== node) parent.insertBefore(node, at ?? null);
  });
  [...parent.children].slice(nodes.length).forEach((node) => node.remove());
}

function statusOf(exchange: WorkbenchExchange): {
  readonly text: string;
  readonly tone: Tone;
} {
  if (exchange.status === 'pending') return { text: '…', tone: 'pending' };
  if (exchange.status === 'cancelled')
    return { text: 'cancelled', tone: 'cancelled' };
  const tone = exchange.status === 'error' ? 'error' : 'ok';
  return {
    text:
      exchange.httpStatus === undefined
        ? exchange.status
        : String(exchange.httpStatus),
    tone,
  };
}

function typeOf(exchange: WorkbenchExchange): string {
  if (exchange.kind === 'tool') return 'browser tool';
  return exchange.path
    ? `${exchange.method} ${exchange.path}`
    : exchange.method;
}

const isHttpError = (exchange: WorkbenchExchange) =>
  (exchange.httpStatus ?? 0) >= 400;

const inputOf = (exchange: WorkbenchExchange) =>
  record(record(exchange.request)?.['input']);

function eventBadge(frame: WorkbenchFrame): string {
  return text(record(frame.payload)?.['type']) ?? frame.kind;
}

function eventSummary(frame: WorkbenchFrame): string {
  const payload = record(frame.payload);
  const summary =
    frame.kind === 'response'
      ? `HTTP ${String(payload?.['status'] ?? '')}`
      : (text(payload?.['delta']) ??
        text(payload?.['toolCallName']) ??
        text(payload?.['message']) ??
        text(payload?.['source']) ??
        text(payload?.['problem']) ??
        (typeof payload?.['status'] === 'string' ? payload['status'] : ''));
  return truncate(summary.replace(/\s+/g, ' '), 80);
}

/** The assembled response: text, tool calls and finish reason. */
function assemble(
  exchange: WorkbenchExchange,
  events: readonly WorkbenchFrame[],
) {
  const attached = exchange.eventIndexes
    .slice(1)
    .map((index) => events[index])
    .filter((frame): frame is WorkbenchFrame => !!frame);
  const payloads = attached.map((frame) => record(frame.payload));
  const content = payloads
    .filter((payload) => payload?.['type'] === 'TEXT_MESSAGE_CONTENT')
    .map((payload) => text(payload?.['delta']) ?? '')
    .join('');
  const decision = attached
    .filter(
      (frame) =>
        frame.kind === 'event' && !text(record(frame.payload)?.['type']),
    )
    .at(-1)?.payload;
  const calls = payloads
    .filter((payload) => payload?.['type'] === 'TOOL_CALL_START')
    .map((payload) => {
      const id = text(payload?.['toolCallId']);
      return {
        name: text(payload?.['toolCallName']) ?? 'tool',
        ...(id ? { id } : {}),
        args: payloads
          .filter(
            (other) =>
              other?.['type'] === 'TOOL_CALL_ARGS' &&
              other['toolCallId'] === id,
          )
          .map((other) => text(other?.['delta']) ?? '')
          .join(''),
      };
    });
  const finished = payloads.filter(
    (payload) => payload?.['type'] === 'RUN_FINISHED',
  );
  const finishReason = finished
    .map(
      (payload) =>
        text(
          record(record(payload?.['metadata'])?.['hashbrown'])?.[
            'finishReason'
          ],
        ) ?? text(payload?.['finishReason']),
    )
    .filter((reason): reason is string => !!reason)
    .at(-1);
  return { attached, content, decision, calls, finishReason };
}

function detailTabsFor(exchange: WorkbenchExchange): readonly DetailTab[] {
  if (exchange.kind === 'tool')
    return [
      { key: 'Call', label: 'Call' },
      { key: 'Result', label: 'Result' },
      { key: 'Raw', label: 'Raw' },
    ];
  if (isHttpError(exchange))
    return [
      { key: 'Overview', label: 'Overview' },
      { key: 'Raw', label: 'Raw' },
    ];
  const input = inputOf(exchange);
  return [
    { key: 'Overview', label: 'Overview' },
    {
      key: 'Messages',
      label: 'Messages',
      count: list(input?.['messages']).length,
    },
    { key: 'Tools', label: 'Tools', count: list(input?.['tools']).length },
    { key: 'State', label: 'State' },
    { key: 'Raw request', label: 'Raw request' },
    {
      key: 'Response',
      label: 'Response',
      count: exchange.eventIndexes.length - 1,
    },
  ];
}

/** A definition list of label and value pairs; values may be nodes. */
function facts(
  entries: readonly (readonly [string, string | Node | undefined])[],
): HTMLDListElement {
  const dl = element('dl', '', 'wb-requests-facts');
  entries.forEach(([term, value]) => {
    if (value === undefined || value === '') return;
    const dd = element('dd');
    dd.append(value);
    dl.append(element('dt', term), dd);
  });
  return dl;
}

function toned(value: string, tone: Tone): HTMLSpanElement {
  const node = element('span', value, 'wb-requests-status');
  node.dataset.tone = tone;
  return node;
}

function heading(value: string): HTMLHeadingElement {
  return element('h4', value, 'wb-requests-heading');
}

/**
 * Creates the Requests view: an overview timeline over the whole run, a table
 * of request and tool exchanges grouped by turn, and, once a row is selected,
 * a detail pane with tabs that apply to that row. Selection, the open detail
 * tab and the selected response event live in this closure, so they survive
 * the shell's re-renders. While live, an HTTP error is selected automatically
 * unless the user has already picked a row.
 *
 * @param options - The instance id and the seek callback.
 * @returns The view element, `update` for each store change and `dispose`.
 */
export function createWorkbenchRequestsView(
  options: WorkbenchRequestsViewOptions,
): WorkbenchRequestsView {
  const { instanceId, seek } = options;
  let latest: WorkbenchRequestsViewInput | undefined;
  let turns: readonly WorkbenchTurnExchanges[] = [];
  let exchanges: readonly WorkbenchExchange[] = [];
  let selectedId: string | null = null;
  let userSelected = false;
  let autoSeen: ReadonlySet<string> = new Set();
  let detailTab: string | null = null;
  let selectedEvent: number | null = null;
  let rovingId: string | null = null;
  let detailKey = '';
  /** The first captured frame; a different one means a new run. */
  let runFirst: WorkbenchFrame | undefined;
  let runLength = 0;
  let rows: ReadonlyMap<string, Row> = new Map();
  let groups: ReadonlyMap<number, Group> = new Map();

  const root = element('div', '', 'wb-inspection wb-requests');
  const timeline = createWorkbenchRequestsTimeline({ seek });
  const empty = element(
    'p',
    'Send a message to follow its requests.',
    'wb-muted wb-requests-empty',
  );
  const body = element('div', '', 'wb-requests-body');
  const tableWrap = element('div', '', 'wb-requests-table-wrap');
  const table = element('table', '', 'wb-requests-table');
  const caption = element('caption', 'Requests and tool calls by turn');
  caption.className = 'wb-visually-hidden';
  const head = element('thead');
  const headRow = element('tr');
  columns.forEach((name) => {
    const cell = element('th', name);
    cell.scope = 'col';
    cell.dataset.column = name.toLowerCase();
    headRow.append(cell);
  });
  head.append(headRow);
  table.append(caption, head);
  tableWrap.append(table);

  const detail = element('section', '', 'wb-requests-detail');
  detail.setAttribute('aria-label', 'Request detail');
  const detailHead = element('div', '', 'wb-requests-detail-head');
  const back = button('Back to requests', 'wb-requests-back', () => close());
  back.setAttribute('aria-label', 'Back to requests');
  back.dataset.focusKey = 'back';
  const tablist = element('div', '', 'wb-requests-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Request detail views');
  const closeButton = button('✕', 'wb-requests-close', () => close());
  closeButton.setAttribute('aria-label', 'Close request detail');
  closeButton.title = 'Close request detail';
  closeButton.dataset.focusKey = 'close';
  detailHead.append(back, tablist, closeButton);
  const panel = element('div', '', 'wb-requests-panel');
  panel.id = `${instanceId}-request-detail`;
  panel.setAttribute('role', 'tabpanel');
  detail.append(detailHead, panel);
  body.append(tableWrap);
  root.append(timeline.element, empty, body);

  const find = (id: string | null) =>
    exchanges.find((exchange) => exchange.id === id);

  /**
   * Selects a row and seeks to its first event. While a response is loading
   * the store ignores seeks, so the row is selected but the cursor stays live.
   */
  function select(id: string) {
    const exchange = find(id);
    if (!exchange) return;
    selectedId = id;
    userSelected = true;
    rovingId = id;
    selectedEvent = null;
    seek(exchange.firstIndex);
    draw();
    // A narrow inspector replaces the table with the detail; follow it there.
    if (getComputedStyle(tableWrap).display === 'none') back.focus();
  }

  function close() {
    const id = selectedId;
    if (id === null) return;
    selectedId = null;
    userSelected = false;
    selectedEvent = null;
    rovingId = id;
    draw();
    rows.get(id)?.button.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || selectedId === null) return;
    event.preventDefault();
    close();
  }
  root.addEventListener('keydown', onKeydown);

  table.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.exchange) return;
    const order = exchanges.map((exchange) => exchange.id);
    const at = order.indexOf(target.dataset.exchange);
    const next =
      event.key === 'ArrowDown'
        ? at + 1
        : event.key === 'ArrowUp'
          ? at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? order.length - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const id = order[Math.min(order.length - 1, Math.max(0, next))];
    rovingId = id;
    syncRoving();
    rows.get(id)?.button.focus();
  });

  function syncRoving() {
    const fallback = find(rovingId) ? rovingId : (exchanges[0]?.id ?? null);
    rows.forEach((row, id) => {
      row.button.tabIndex = id === fallback ? 0 : -1;
    });
  }

  function createRow(exchange: WorkbenchExchange): Row {
    const tr = element('tr');
    tr.dataset.exchange = exchange.id;
    const name = element('td', '', 'wb-requests-name');
    const rowButton = button(exchange.name, '', () => select(exchange.id));
    rowButton.dataset.exchange = exchange.id;
    rowButton.addEventListener('focus', () => {
      rovingId = exchange.id;
      syncRoving();
    });
    const compact = element(
      'span',
      '',
      'wb-requests-status wb-requests-compact',
    );
    name.append(rowButton, compact);
    const typeCell = element('td');
    const type = element('span', '', 'wb-badge');
    typeCell.append(type);
    const status = element('td', '', 'wb-requests-status');
    const start = element('td', '', 'wb-num');
    const duration = element('td', '', 'wb-num');
    const count = element('td', '', 'wb-num');
    const fall = element('td', '', 'wb-requests-waterfall');
    const track = element('span', '', 'wb-requests-fall');
    track.setAttribute('aria-hidden', 'true');
    const bar = element('span');
    track.append(bar);
    fall.append(track);
    tr.append(name, typeCell, status, start, duration, count, fall);
    return {
      tr,
      button: rowButton,
      compact,
      type,
      status,
      start,
      duration,
      count,
      bar,
    };
  }

  function drawTable(
    events: readonly WorkbenchFrame[],
    cursor: number | null,
    currentId: string | undefined,
    percentAt: (ms: number, turn: number) => number,
  ) {
    const at = cursor ?? events.length - 1;
    const nextRows = new Map<string, Row>();
    const nextGroups = new Map<number, Group>();
    turns.forEach(({ turn, userText, exchanges: turnExchanges }) => {
      const group = groups.get(turn) ?? {
        tbody: element('tbody'),
        heading: element('th'),
      };
      if (!groups.has(turn)) {
        group.tbody.dataset.turn = String(turn);
        group.heading.scope = 'rowgroup';
        group.heading.colSpan = columns.length;
        const headingRow = element('tr', '', 'wb-requests-group');
        headingRow.append(group.heading);
        group.tbody.append(headingRow);
      }
      group.heading.textContent = userText
        ? `Turn ${turn} · ${truncate(userText.replace(/\s+/g, ' '), 60)}`
        : `Turn ${turn}`;
      nextGroups.set(turn, group);
      const turnRows = turnExchanges.map((exchange) => {
        const row = rows.get(exchange.id) ?? createRow(exchange);
        nextRows.set(exchange.id, row);
        const { text: statusText, tone } = statusOf(exchange);
        const selected = exchange.id === selectedId;
        row.tr.dataset.kind = exchange.kind;
        row.tr.dataset.tone = tone;
        row.tr.setAttribute('aria-selected', String(selected));
        row.tr.toggleAttribute('data-current', exchange.id === currentId);
        row.tr.toggleAttribute(
          'data-future',
          cursor !== null && exchange.firstIndex > at,
        );
        row.button.textContent = exchange.name;
        row.button.setAttribute('aria-pressed', String(selected));
        row.compact.textContent = statusText;
        row.compact.dataset.tone = tone;
        row.type.textContent = typeOf(exchange);
        row.type.dataset.kind = exchange.kind;
        row.type.title = exchange.pathConfigured
          ? 'Configured endpoint; this request carried no URL'
          : '';
        row.type.toggleAttribute('data-configured', exchange.pathConfigured);
        row.status.textContent = statusText;
        row.status.dataset.tone = tone;
        row.start.textContent = ms(exchange.startMs);
        row.duration.textContent = ms(exchange.endMs - exchange.startMs);
        row.count.textContent = String(exchange.eventIndexes.length);
        const left = percentAt(exchange.startMs, exchange.turn);
        row.bar.style.left = `${left}%`;
        row.bar.style.width = `${percentAt(exchange.endMs, exchange.turn) - left}%`;
        row.bar.dataset.lane =
          exchange.kind === 'tool'
            ? 'tool'
            : exchange.status === 'error'
              ? 'error'
              : 'request';
        return row.tr;
      });
      const headingRow = group.tbody.firstElementChild as Element;
      syncChildren(group.tbody, [headingRow, ...turnRows]);
    });
    rows = nextRows;
    groups = nextGroups;
    rebuildKeepingFocus(table, 'data-exchange', () =>
      syncChildren(table, [
        caption,
        head,
        ...[...nextGroups.values()].map((group) => group.tbody),
      ]),
    );
    table.toggleAttribute('data-narrow', selectedId !== null);
    syncRoving();
  }

  function overviewBody(
    exchange: WorkbenchExchange,
    events: readonly WorkbenchFrame[],
    source: string,
  ): readonly Node[] {
    const request = record(exchange.request);
    const response = record(exchange.response);
    const { text: statusText, tone } = statusOf(exchange);
    const contentType =
      text(response?.['contentType']) ??
      text(response?.['content-type']) ??
      text(record(response?.['headers'])?.['content-type']);
    const endpoint = `${typeOf(exchange)}${exchange.pathConfigured ? ' · configured' : ''}`;
    if (isHttpError(exchange))
      return [
        facts([
          ['Status', toned(statusText, tone)],
          [
            'URL',
            text(response?.['url']) ?? text(request?.['url']) ?? endpoint,
          ],
          ['Source', text(response?.['source']) ?? source],
          ['Problem', exchange.problem],
        ]),
      ];
    const input = inputOf(exchange);
    const attempt = request?.['attempt'];
    const revision = record(input?.['state'])?.['revision'];
    const { attached, calls } = assemble(exchange, events);
    const sent = [
      plural(list(input?.['messages']).length, 'message'),
      plural(list(input?.['tools']).length, 'tool'),
      ...(typeof revision === 'number' ? [`state revision ${revision}`] : []),
    ].join(' · ');
    const received = [
      plural(attached.length, 'event'),
      calls.length
        ? `tool calls ${calls.map((call) => call.name).join(', ')}`
        : 'no tool calls',
    ].join(' · ');
    const statusNode = toned(
      contentType ? `${statusText} · ${contentType}` : statusText,
      tone,
    );
    return [
      facts([
        ['Endpoint', endpoint],
        ['Status', statusNode],
        ['Attempt', typeof attempt === 'number' ? String(attempt) : undefined],
        ['Thread', text(input?.['threadId'])],
        ['Run', text(input?.['runId'])],
        ['Source', text(response?.['source']) ?? source],
        ['Problem', exchange.problem],
      ]),
      element('p', `Sent: ${sent}`, 'wb-requests-summary'),
      element('p', `Received: ${received}`, 'wb-requests-summary'),
    ];
  }

  function messagesBody(exchange: WorkbenchExchange): readonly Node[] {
    const messages = list(inputOf(exchange)?.['messages']);
    if (!messages.length)
      return [element('p', 'This request sent no messages.', 'wb-muted')];
    const cards = element('ol', '', 'wb-requests-cards');
    messages.forEach((value) => {
      const message = record(value);
      const card = element('li', '', 'wb-requests-card');
      const top = element('div', '', 'wb-requests-card-head');
      top.append(
        element('span', text(message?.['role']) ?? 'message', 'wb-badge'),
      );
      const callId = text(message?.['toolCallId']);
      if (callId) top.append(element('span', `tool call ${callId}`, 'wb-mono'));
      card.append(top);
      const content = message?.['content'];
      if (typeof content === 'string')
        card.append(element('p', content, 'wb-requests-content'));
      else if (content !== undefined) card.append(code(content));
      const toolCalls = message?.['toolCalls'];
      if (toolCalls !== undefined) card.append(code(toolCalls));
      cards.append(card);
    });
    return [cards];
  }

  function toolsBody(exchange: WorkbenchExchange): readonly Node[] {
    const tools = list(inputOf(exchange)?.['tools']);
    if (!tools.length)
      return [element('p', 'This request declared no tools.', 'wb-muted')];
    const cards = element('ol', '', 'wb-requests-cards');
    tools.forEach((value) => {
      const tool = record(value);
      const card = element('li', '', 'wb-requests-card');
      card.append(
        element('strong', text(tool?.['name']) ?? 'tool', 'wb-mono'),
        ...(text(tool?.['description'])
          ? [element('p', text(tool?.['description']), 'wb-requests-content')]
          : []),
        code(tool?.['parameters'] ?? null),
      );
      cards.append(card);
    });
    return [cards];
  }

  function responseBody(
    exchange: WorkbenchExchange,
    events: readonly WorkbenchFrame[],
    cursor: number | null,
  ): readonly Node[] {
    const { content, decision, calls, finishReason } = assemble(
      exchange,
      events,
    );
    const { text: statusText, tone } = statusOf(exchange);
    const result =
      content || decision === undefined
        ? content
          ? element('p', content, 'wb-requests-content')
          : undefined
        : code(decision);
    const callList = calls.length
      ? element('ul', '', 'wb-requests-calls')
      : undefined;
    calls.forEach((call) => {
      const item = element('li');
      item.append(
        element('strong', call.name, 'wb-mono'),
        ...(call.id
          ? [element('span', ` ${call.id}`, 'wb-mono wb-muted')]
          : []),
      );
      if (call.args) item.append(element('code', ` ${call.args}`, 'wb-mono'));
      callList?.append(item);
    });
    const at = cursor ?? events.length - 1;
    const eventList = element('ol', '', 'wb-requests-events');
    exchange.eventIndexes.slice(1).forEach((index) => {
      const frame = events[index];
      if (!frame) return;
      const item = element('li');
      item.dataset.event = '';
      item.toggleAttribute('data-future', cursor !== null && index > at);
      const row = button('', '', () => {
        selectedEvent = index;
        seek(index);
        draw();
      });
      row.dataset.eventIndex = String(index);
      row.dataset.focusKey = `event:${index}`;
      row.setAttribute('aria-pressed', String(selectedEvent === index));
      row.append(
        element('span', `+${ms(frame.elapsedMs - exchange.startMs)}`, 'wb-num'),
        element('span', eventBadge(frame), 'wb-badge'),
        element('span', eventSummary(frame), 'wb-requests-event-summary'),
      );
      item.append(row);
      eventList.append(item);
    });
    const raw =
      selectedEvent !== null && exchange.eventIndexes.includes(selectedEvent)
        ? [
            heading(`Event ${selectedEvent + 1} payload`),
            code(events[selectedEvent]?.payload, 'wb-requests-event-raw'),
          ]
        : [];
    return [
      facts([
        ['HTTP status', toned(statusText, tone)],
        ['Finish reason', finishReason],
        ['Result', result ?? (exchange.status === 'pending' ? '…' : undefined)],
        ['Tool calls', callList],
      ]),
      heading('Events'),
      eventList.childElementCount
        ? eventList
        : element('p', 'No events received yet.', 'wb-muted'),
      ...raw,
    ];
  }

  function toolCallBody(exchange: WorkbenchExchange): readonly Node[] {
    const link = (id: string | undefined) => {
      const target = find(id ?? null);
      if (!target) return undefined;
      const node = button(
        `${target.name} · turn ${target.turn}`,
        'wb-requests-link',
        () => select(target.id),
      );
      node.dataset.focusKey = `link:${target.id}`;
      return node;
    };
    return [
      facts([
        ['Name', exchange.tool?.name ?? exchange.name],
        ['Runs in', 'Browser'],
        ['Call id', exchange.tool?.callId],
        ['Caused by', link(exchange.parentId)],
        ['Answered in', link(exchange.answeredById)],
      ]),
    ];
  }

  function panelBody(
    exchange: WorkbenchExchange,
    tab: string,
    input: WorkbenchRequestsViewInput,
  ): readonly Node[] {
    const { events, cursor } = input.snapshot;
    if (exchange.kind === 'tool')
      return tab === 'Result'
        ? [code(exchange.tool?.result ?? null)]
        : tab === 'Raw'
          ? [code(events[exchange.firstIndex]?.payload)]
          : toolCallBody(exchange);
    if (tab === 'Raw')
      return [
        heading('Request'),
        code(exchange.request),
        heading('Response'),
        code(exchange.response),
      ];
    if (tab === 'Messages') return messagesBody(exchange);
    if (tab === 'Tools') return toolsBody(exchange);
    if (tab === 'State') {
      const requestInput = inputOf(exchange);
      return [
        heading('State'),
        code(requestInput?.['state'] ?? null),
        heading('Context'),
        code(requestInput?.['context'] ?? null),
      ];
    }
    if (tab === 'Raw request') {
      const copy = button('Copy', 'wb-requests-copy', () => {
        try {
          navigator.clipboard
            ?.writeText(JSON.stringify(exchange.request ?? null, null, 2))
            .catch(() => undefined);
        } catch {
          // Copy is a convenience; without clipboard access it does nothing.
        }
      });
      copy.setAttribute('aria-label', 'Copy raw request');
      copy.dataset.focusKey = 'copy';
      const bar = element('div', '', 'wb-requests-toolbar');
      bar.append(element('span', 'As captured', 'wb-muted'), copy);
      return [bar, code(exchange.request)];
    }
    if (tab === 'Response') return responseBody(exchange, events, cursor);
    return overviewBody(exchange, events, input.source);
  }

  function drawDetail(input: WorkbenchRequestsViewInput) {
    const exchange = find(selectedId);
    if (!exchange) {
      detail.remove();
      delete detail.dataset.detail;
      detailKey = '';
      return;
    }
    const tabs = detailTabsFor(exchange);
    const active = tabs.some((tab) => tab.key === detailTab)
      ? (detailTab as string)
      : tabs[0].key;
    detailTab = active;
    detail.dataset.detail = '';
    if (!detail.isConnected) body.append(detail);
    // Only Response greys rows by the playhead; other tabs ignore the cursor.
    const key = JSON.stringify([
      exchange.id,
      exchange.status,
      exchange.eventIndexes.length,
      exchange.answeredById ?? null,
      active,
      active === 'Response' ? input.snapshot.cursor : null,
      selectedEvent,
      input.source,
    ]);
    if (key === detailKey) return;
    detailKey = key;
    rebuildKeepingFocus(detail, 'data-focus-key', () => {
      tablist.replaceChildren(
        ...tabs.map(({ key: tabKey, label, count }) => {
          const tab = button(label, '', () => {
            detailTab = tabKey;
            selectedEvent = null;
            draw();
          });
          if (count !== undefined)
            tab.append(
              ' ',
              element('span', String(count), 'wb-requests-count'),
            );
          tab.setAttribute('role', 'tab');
          tab.id = `${instanceId}-request-tab-${tabKey.replace(/\s+/g, '-').toLowerCase()}`;
          tab.setAttribute('aria-selected', String(tabKey === active));
          tab.setAttribute('aria-controls', panel.id);
          tab.dataset.focusKey = `tab:${tabKey}`;
          if (tabKey === active) panel.setAttribute('aria-labelledby', tab.id);
          return tab;
        }),
      );
      panel.replaceChildren(...panelBody(exchange, active, input));
    });
  }

  function draw() {
    const input = latest;
    if (!input) return;
    const { events, cursor } = input.snapshot;
    const axis = workbenchActiveAxis(events);
    const at = cursor ?? events.length - 1;
    const atEvent = events[at];
    const current = atEvent
      ? exchanges
          .filter(
            (exchange) =>
              exchange.turn === atEvent.turn && exchange.firstIndex <= at,
          )
          .at(-1)
      : undefined;
    timeline.update({
      events,
      cursor,
      busy: input.busy,
      axis,
      exchanges,
      flag: current?.name ?? '',
      valueText: atEvent
        ? `Event ${at + 1} of ${events.length}, turn ${atEvent.turn}: ${current ? `${current.name} · ` : ''}${eventBadge(atEvent)}`
        : 'No captured events',
    });
    empty.hidden = exchanges.length > 0;
    body.hidden = exchanges.length === 0;
    root.toggleAttribute('data-open', selectedId !== null);
    drawTable(events, cursor, current?.id, axis.percentAt);
    drawDetail(input);
  }

  return {
    element: root,
    update(input) {
      latest = input;
      const { events } = input.snapshot;
      // Exchange ids are positional, so a cleared store reuses them: forget
      // the previous run's selection and automatic picks.
      if (events.length < runLength || events[0] !== runFirst) {
        autoSeen = new Set();
        selectedId = null;
        userSelected = false;
        selectedEvent = null;
        detailTab = null;
        detailKey = '';
      }
      runFirst = events[0];
      runLength = events.length;
      turns = workbenchExchanges(input.snapshot.events, {
        format: input.format,
        endpoint: input.endpoint,
        settledStatus: input.snapshot.status,
      });
      exchanges = turns.flatMap((turn) => turn.exchanges);
      if (selectedId !== null && !find(selectedId)) {
        selectedId = null;
        userSelected = false;
        selectedEvent = null;
      }
      if (input.snapshot.cursor === null && !userSelected) {
        const failures = exchanges.filter(
          (exchange) => isHttpError(exchange) && !autoSeen.has(exchange.id),
        );
        const failure = failures.at(-1);
        if (failure) {
          selectedId = failure.id;
          selectedEvent = null;
          autoSeen = new Set([...autoSeen, ...failures.map(({ id }) => id)]);
        }
      }
      draw();
    },
    dispose: () => {
      root.removeEventListener('keydown', onKeydown);
      timeline.dispose();
    },
  };
}
