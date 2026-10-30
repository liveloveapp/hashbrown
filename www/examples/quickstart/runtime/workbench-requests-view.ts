import { createWorkbenchTabs } from './workbench-tabs';
import type { WorkbenchFrame, WorkbenchSnapshot } from './workbench';
import { renderWorkbenchCode } from './workbench-highlight';
import {
  type WorkbenchExchange,
  workbenchExchanges,
  type WorkbenchTurnExchanges,
} from './workbench-requests';
import { workbenchActiveAxis } from './workbench-requests-axis';
import { exchangeAtPlayhead } from './workbench-requests-follow';
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
  /** The main timeline's flag text, so the overview strip reads the same. */
  readonly flag: string;
}

/** The inspector's Requests tab: overview timeline, picker, table and detail pane. */
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

/** Sets an attribute, or removes it for `null`. */
function setAria(node: Element, name: string, value: string | null): void {
  if (value === null) node.removeAttribute(name);
  else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

const setRole = (node: Element, role: string | null) =>
  setAria(node, 'role', role);

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
    { key: 'Request', label: 'Request' },
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
 * of request and tool exchanges grouped by turn, and a detail pane with tabs
 * that apply to the selected row. The detail follows the playhead, showing the
 * exchange under it, until the reader picks a row; the next cursor move that
 * the view did not make resumes following. A narrow inspector hides the strip
 * and the table and offers the rows from a header picker instead. Selection,
 * the open detail tab and the selected response event live in this closure,
 * so they survive the shell's re-renders. While live, an HTTP error is
 * selected automatically unless the user has already picked a row.
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
  /** True once the reader picks a row; a cursor move not made here clears it. */
  let userSelected = false;
  /** True after the reader closes the detail; picking or a cursor move reopens it. */
  let closed = false;
  /** The cursor at the last update; `undefined` before the first one. */
  let lastCursor: number | null | undefined;
  /** The index the view itself is seeking to, so that move keeps a pick. */
  let ownSeek: number | undefined;
  let pickerOpen = false;
  let autoSeen: ReadonlySet<string> = new Set();
  let detailTab: string | null = null;
  let selectedEvent: number | null = null;
  let rovingId: string | null = null;
  /** What the tab row was built for; counts update in place between builds. */
  let tabsKey = '';
  /** What the panel was built for; tabs key only on the data they show. */
  let panelKey = '';
  let tabCounts: ReadonlyMap<string, HTMLElement> = new Map();
  /** The first captured frame; a different one means a new run. */
  let runFirst: WorkbenchFrame | undefined;
  let runLength = 0;
  let rows: ReadonlyMap<string, Row> = new Map();
  let groups: ReadonlyMap<number, Group> = new Map();

  const root = element('div', '', 'wb-inspection wb-requests');
  /** Seeks for the view's own controls; the move does not end a pick. */
  function seekHere(index: number) {
    ownSeek = index;
    seek(index);
    // The store renders synchronously, so the update has already seen it.
    ownSeek = undefined;
  }
  const timeline = createWorkbenchRequestsTimeline({ seek });
  const empty = element(
    'p',
    'Send a message to follow its requests.',
    'wb-muted wb-requests-empty',
  );
  const body = element('div', '', 'wb-requests-body');
  const tableWrap = element('div', '', 'wb-requests-table-wrap');
  tableWrap.id = `${instanceId}-request-list`;
  const pickbar = element('div', '', 'wb-requests-pickbar');
  const picker = button('', 'wb-requests-picker', () => setPicker(!pickerOpen));
  picker.setAttribute('aria-haspopup', 'listbox');
  picker.setAttribute('aria-expanded', 'false');
  picker.setAttribute('aria-controls', tableWrap.id);
  pickbar.append(picker);
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
  const tablist = element('div', '', 'wb-requests-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Request detail views');
  const closeButton = button('✕', 'wb-requests-close', () => close());
  closeButton.setAttribute('aria-label', 'Close request detail');
  closeButton.title = 'Close request detail';
  closeButton.dataset.focusKey = 'close';
  detailHead.append(tablist, closeButton);
  const panel = element('div', '', 'wb-requests-panel');
  panel.id = `${instanceId}-request-detail`;
  panel.setAttribute('role', 'tabpanel');
  const detailTabs = createWorkbenchTabs(tablist, panel);
  detail.append(detailHead, panel);
  body.append(tableWrap);
  root.append(timeline.element, empty, pickbar, body);

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
    closed = false;
    rovingId = id;
    selectedEvent = null;
    seekHere(exchange.firstIndex);
    draw();
  }

  /** A row pick: selects it and, from the picker, closes the list. */
  function pick(id: string) {
    const fromPicker = pickerOpen;
    if (fromPicker) pickerOpen = false;
    select(id);
    if (fromPicker) picker.focus();
  }

  function setPicker(open: boolean) {
    pickerOpen = open;
    draw();
    const focusId = find(selectedId) ? selectedId : rovingId;
    if (!open) picker.focus();
    else if (focusId !== null) rows.get(focusId)?.button.focus();
  }

  function close() {
    const id = selectedId;
    if (id === null) return;
    selectedId = null;
    userSelected = false;
    closed = true;
    selectedEvent = null;
    rovingId = id;
    draw();
    rows.get(id)?.button.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (pickerOpen) {
      event.preventDefault();
      setPicker(false);
      return;
    }
    // A narrow inspector has no close control: the detail is all it shows.
    if (selectedId === null || getComputedStyle(closeButton).display === 'none')
      return;
    event.preventDefault();
    close();
  }
  root.addEventListener('keydown', onKeydown);

  table.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.exchange) return;
    if (event.key === 'Enter' && pickerOpen) {
      // Claim Enter so the button's own click does not pick a second time.
      event.preventDefault();
      pick(target.dataset.exchange);
      return;
    }
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
    const rowButton = button(exchange.name, '', () => pick(exchange.id));
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
      setRole(group.tbody, pickerOpen ? 'group' : null);
      setAria(
        group.tbody,
        'aria-label',
        pickerOpen ? group.heading.textContent : null,
      );
      setRole(group.heading, pickerOpen ? 'presentation' : null);
      setRole(
        group.tbody.firstElementChild as Element,
        pickerOpen ? 'presentation' : null,
      );
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
        listRoles(row, selected);
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
    table.toggleAttribute('data-narrow', detailShown());
    setRole(tableWrap, pickerOpen ? 'listbox' : null);
    setAria(tableWrap, 'aria-label', pickerOpen ? 'Requests' : null);
    setRole(table, pickerOpen ? 'presentation' : null);
    head.hidden = pickerOpen;
    syncRoving();
  }

  /**
   * Row semantics: a table row with a pressed button, or, while the picker is
   * open, a listbox option (the button) inside presentational cells.
   */
  function listRoles(row: Row, selected: boolean) {
    setRole(row.tr, pickerOpen ? 'presentation' : null);
    [...row.tr.children].forEach((cell) =>
      setRole(cell, pickerOpen ? 'presentation' : null),
    );
    setRole(row.button, pickerOpen ? 'option' : null);
    setAria(row.button, 'aria-selected', pickerOpen ? String(selected) : null);
    setAria(row.button, 'aria-pressed', pickerOpen ? null : String(selected));
  }

  function drawPicker() {
    const exchange = find(selectedId);
    const chevron = element('span', '▾', 'wb-requests-picker-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const status = exchange ? statusOf(exchange) : undefined;
    const parts = [
      element(
        'span',
        exchange
          ? `${exchange.name} · Turn ${exchange.turn}`
          : 'No request yet',
        'wb-requests-picker-name',
      ),
      ...(exchange && status
        ? [
            toned(status.text, status.tone),
            element('span', ms(exchange.endMs - exchange.startMs), 'wb-num'),
          ]
        : []),
    ];
    const label = JSON.stringify(parts.map((part) => part.textContent));
    // Rebuild only on change, so a screen reader is not told it changed.
    if (picker.dataset.label !== label) {
      picker.dataset.label = label;
      picker.replaceChildren(...parts, chevron);
    }
    picker.setAttribute('aria-expanded', String(pickerOpen));
    pickbar.hidden = exchanges.length === 0;
  }

  /** The detail shows unless the reader closed it or nothing was captured. */
  const detailShown = () => !closed && exchanges.length > 0;

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
        seekHere(index);
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
        [
          exchange.method === 'LOCAL' ? 'Native stream status' : 'HTTP status',
          toned(statusText, tone),
        ],
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
    if (tab === 'Request') {
      const copy = button('Copy', 'wb-requests-copy', () => {
        try {
          navigator.clipboard
            ?.writeText(JSON.stringify(exchange.request ?? null, null, 2))
            .catch(() => undefined);
        } catch {
          // Copy is a convenience; without clipboard access it does nothing.
        }
      });
      copy.setAttribute('aria-label', 'Copy request');
      copy.dataset.focusKey = 'copy';
      const bar = element('div', '', 'wb-requests-toolbar');
      bar.append(element('span', 'As captured', 'wb-muted'), copy);
      return [bar, code(exchange.request)];
    }
    if (tab === 'Response') return responseBody(exchange, events, cursor);
    return overviewBody(exchange, events, input.source);
  }

  function drawDetail(input: WorkbenchRequestsViewInput) {
    if (!detailShown()) {
      detail.remove();
      delete detail.dataset.detail;
      tabsKey = '';
      panelKey = '';
      return;
    }
    detail.dataset.detail = '';
    if (!detail.isConnected) body.append(detail);
    const exchange = find(selectedId);
    if (!exchange) {
      // The playhead is before the first request.
      if (tabsKey === 'none') return;
      tablist.replaceChildren();
      tabCounts = new Map();
      panel.removeAttribute('aria-labelledby');
      panel.replaceChildren(element('p', 'No request yet', 'wb-muted'));
      tabsKey = 'none';
      panelKey = 'none';
      return;
    }
    const tabs = detailTabsFor(exchange);
    const active = tabs.some((tab) => tab.key === detailTab)
      ? (detailTab as string)
      : tabs[0].key;
    detailTab = active;
    const nextTabsKey = JSON.stringify([
      exchange.id,
      tabs.map((tab) => tab.key),
      active,
    ]);
    const nextPanelKey = JSON.stringify([
      exchange.id,
      active,
      ...panelDeps(exchange, active, input),
    ]);
    if (nextTabsKey === tabsKey && nextPanelKey === panelKey) {
      updateCounts(tabs);
      return;
    }
    rebuildKeepingFocus(detail, 'data-focus-key', () => {
      if (nextTabsKey !== tabsKey) buildTabs(tabs, active);
      else updateCounts(tabs);
      if (nextPanelKey !== panelKey)
        panel.replaceChildren(...panelBody(exchange, active, input));
    });
    tabsKey = nextTabsKey;
    panelKey = nextPanelKey;
  }

  /**
   * The data a tab's panel shows beyond the exchange id. Streamed events only
   * change Overview and Response; Response also greys rows by the playhead.
   */
  function panelDeps(
    exchange: WorkbenchExchange,
    tab: string,
    input: WorkbenchRequestsViewInput,
  ): readonly unknown[] {
    if (tab === 'Overview')
      return [
        exchange.status,
        exchange.eventIndexes.length,
        exchange.response === undefined,
        input.source,
      ];
    if (tab === 'Response')
      return [
        exchange.status,
        exchange.eventIndexes.length,
        input.snapshot.cursor,
        selectedEvent,
      ];
    if (tab === 'Call') return [exchange.answeredById ?? null];
    if (tab === 'Raw') return [exchange.response === undefined];
    return [];
  }

  function updateCounts(tabs: readonly DetailTab[]) {
    tabs.forEach(({ key, count }) => {
      const span = tabCounts.get(key);
      if (span && count !== undefined && span.textContent !== String(count))
        span.textContent = String(count);
    });
  }

  function buildTabs(tabs: readonly DetailTab[], active: string) {
    const counts = new Map<string, HTMLElement>();
    tablist.replaceChildren(
      ...tabs.map(({ key: tabKey, label, count }) => {
        const tab = button(label, '', () => {
          detailTab = tabKey;
          selectedEvent = null;
          draw();
        });
        if (count !== undefined) {
          const span = element('span', String(count), 'wb-requests-count');
          counts.set(tabKey, span);
          tab.append(' ', span);
        }
        tab.setAttribute('role', 'tab');
        tab.id = `${instanceId}-request-tab-${tabKey.replace(/\s+/g, '-').toLowerCase()}`;
        tab.dataset.focusKey = `tab:${tabKey}`;
        return tab;
      }),
    );
    detailTabs.sync(
      `${instanceId}-request-tab-${active.replace(/\s+/g, '-').toLowerCase()}`,
    );
    tabCounts = counts;
  }

  function draw() {
    const input = latest;
    if (!input) return;
    const { events, cursor } = input.snapshot;
    const axis = workbenchActiveAxis(events);
    const at = cursor ?? events.length - 1;
    const atEvent = events[at];
    const current = atEvent ? exchangeAtPlayhead(exchanges, events, at) : null;
    timeline.update({
      events,
      cursor,
      busy: input.busy,
      axis,
      exchanges,
      flag: input.flag,
      valueText: atEvent
        ? `Event ${at + 1} of ${events.length}, turn ${atEvent.turn}: ${current ? `${current.name} · ` : ''}${eventBadge(atEvent)}`
        : 'No captured events',
    });
    empty.hidden = exchanges.length > 0;
    body.hidden = exchanges.length === 0;
    root.toggleAttribute('data-open', detailShown());
    root.toggleAttribute('data-picking', pickerOpen);
    drawTable(events, cursor, current?.id, axis.percentAt);
    drawPicker();
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
        closed = false;
        pickerOpen = false;
        selectedEvent = null;
        detailTab = null;
        tabsKey = '';
        panelKey = '';
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
      const { cursor } = input.snapshot;
      // A scrub, play, step or key press resumes following; the view's own
      // seeks (a row pick, a response event) do not.
      if (cursor !== lastCursor) {
        if (lastCursor !== undefined && cursor !== ownSeek) {
          userSelected = false;
          closed = false;
        }
        lastCursor = cursor;
      }
      if (!userSelected && !closed) {
        const at = cursor ?? events.length - 1;
        const followed = exchangeAtPlayhead(exchanges, events, at)?.id ?? null;
        if (followed !== selectedId) {
          selectedId = followed;
          selectedEvent = null;
        }
      }
      if (cursor === null && !userSelected) {
        const failures = exchanges.filter(
          (exchange) => isHttpError(exchange) && !autoSeen.has(exchange.id),
        );
        const failure = failures.at(-1);
        if (failure) {
          selectedId = failure.id;
          closed = false;
          selectedEvent = null;
          autoSeen = new Set([...autoSeen, ...failures.map(({ id }) => id)]);
        }
      }
      draw();
    },
    dispose: () => {
      root.removeEventListener('keydown', onKeydown);
      timeline.dispose();
      detailTabs.dispose();
    },
  };
}
