import type { WorkbenchFrame } from './workbench';
import { adjacentTurnIndex, workbenchFlagAnchor } from './workbench-player';
import type { WorkbenchExchange } from './workbench-requests';
import type { WorkbenchActiveAxis } from './workbench-requests-axis';
import { attachWorkbenchScrub } from './workbench-scrub';

/** What the overview timeline draws on each update. */
export interface WorkbenchRequestsTimelineInput {
  readonly events: readonly WorkbenchFrame[];
  /** The store cursor; `null` is live, at the last event. */
  readonly cursor: number | null;
  /** Seeking is disabled while a response is loading. */
  readonly busy: boolean;
  readonly axis: WorkbenchActiveAxis;
  readonly exchanges: readonly WorkbenchExchange[];
  /** The main timeline's flag label at the playhead, so both flags read the same. */
  readonly flag: string;
  /** The slider's `aria-valuetext`, naming the event at the playhead. */
  readonly valueText: string;
}

/** The overview strip: turn bands, request lanes and a seekable playhead. */
export interface WorkbenchRequestsTimeline {
  readonly element: HTMLElement;
  update(input: WorkbenchRequestsTimelineInput): void;
  readonly dispose: () => void;
}

type Lane = 'request' | 'stream' | 'tool' | 'error';

interface Bar {
  readonly lane: Lane;
  readonly left: number;
  readonly width: number;
}

function div(className: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  return node;
}

/**
 * Lays out one exchange as lane bars: a request bar for the wait until the
 * first attached event and a stream bar for the attached events, one red bar
 * for a failed request, or a short tool bar.
 */
function exchangeBars(
  exchange: WorkbenchExchange,
  events: readonly WorkbenchFrame[],
  axis: WorkbenchActiveAxis,
): readonly Bar[] {
  const at = (ms: number) => axis.percentAt(ms, exchange.turn);
  const span = (lane: Lane, from: number, to: number): Bar => ({
    lane,
    left: at(from),
    width: Math.max(0, at(to) - at(from)),
  });
  if (exchange.kind === 'tool')
    return [span('tool', exchange.startMs, exchange.endMs)];
  if (exchange.status === 'error')
    return [span('error', exchange.startMs, exchange.endMs)];
  const firstAttached = exchange.eventIndexes[1];
  const streamStart =
    firstAttached === undefined
      ? exchange.endMs
      : (events[firstAttached]?.elapsedMs ?? exchange.endMs);
  return [
    span('request', exchange.startMs, streamStart),
    ...(firstAttached === undefined
      ? []
      : [span('stream', streamStart, exchange.endMs)]),
  ];
}

/**
 * Creates the Requests overview timeline. The strip is a `role="slider"`
 * named "Seek request timeline": a press anywhere seeks to the nearest event
 * and a drag follows the pointer; arrows step one event, Shift+arrows one
 * turn, and Home and End jump to the ends.
 *
 * @param options - `seek` moves the store cursor; the caller pauses playback.
 * @returns The strip element, an `update` to redraw it and `dispose`.
 */
export function createWorkbenchRequestsTimeline(options: {
  readonly seek: (index: number) => void;
}): WorkbenchRequestsTimeline {
  let latest: WorkbenchRequestsTimelineInput | undefined;
  let barsKey = '';
  const element = div('wb-requests-overview');
  const track = div('wb-requests-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', 'Seek request timeline');
  track.setAttribute('aria-valuemin', '0');
  const played = div('wb-requests-played');
  const bands = div('wb-requests-bands');
  const bars = div('wb-requests-bars');
  const playhead = div('wb-requests-playhead');
  const flag = document.createElement('span');
  flag.className = 'wb-requests-flag';
  [played, bands, bars, playhead, flag].forEach((node) =>
    node.setAttribute('aria-hidden', 'true'),
  );
  track.append(played, bands, bars, playhead, flag);
  element.append(track);

  const disabled = () => !latest || latest.busy || !latest.events.length;
  const detachScrub = attachWorkbenchScrub({
    track,
    isDisabled: disabled,
    indexAt: (fraction) => latest?.axis.nearestIndex(fraction * 100) ?? null,
    onScrub: (index) => {
      options.seek(index);
      track.focus({ preventScroll: true });
    },
  });

  track.addEventListener('keydown', (event) => {
    if (!latest || disabled()) return;
    const { events, cursor } = latest;
    const last = events.length - 1;
    const at = cursor ?? last;
    const turnStep = (direction: -1 | 1) =>
      adjacentTurnIndex(events, cursor, direction) ?? at;
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
            ? event.shiftKey
              ? turnStep(-1)
              : at - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowUp'
              ? event.shiftKey
                ? turnStep(1)
                : at + 1
              : undefined;
    if (target === undefined) return;
    // Claim the key so the shell's player shortcuts do not step twice.
    event.preventDefault();
    const clamped = Math.min(last, Math.max(0, target));
    // At the live end, ArrowRight and End have nowhere to go; stay live.
    if (clamped !== at) options.seek(clamped);
  });

  return {
    element,
    update(input) {
      latest = input;
      const { events, cursor, axis, exchanges } = input;
      const last = events.length - 1;
      const index = cursor ?? last;
      track.setAttribute('aria-valuemax', String(Math.max(0, last)));
      track.setAttribute('aria-valuenow', String(Math.max(0, index)));
      track.setAttribute('aria-valuetext', input.valueText);
      track.setAttribute('aria-disabled', String(disabled()));
      track.toggleAttribute('data-disabled', disabled());
      const event = events[index];
      const percent = event ? axis.percentAt(event.elapsedMs, event.turn) : 0;
      played.style.width = `${percent}%`;
      playhead.style.left = `${percent}%`;
      playhead.hidden = !event;
      flag.textContent = event ? input.flag : '';
      flag.style.left = `${percent}%`;
      const anchor = workbenchFlagAnchor(percent);
      if (anchor === 'middle') delete flag.dataset.anchor;
      else flag.dataset.anchor = anchor;
      // Bars depend on the events and statuses only; skip them on cursor moves.
      const key = JSON.stringify([
        events.length,
        exchanges.map((exchange) => [exchange.id, exchange.status]),
      ]);
      if (key === barsKey) return;
      barsKey = key;
      // Turn 0 holds seeded history and workflow frames, not a user turn.
      bands.replaceChildren(
        ...axis.turns
          .filter(({ turn }) => turn !== 0)
          .map(({ turn, startPercent, endPercent }) => {
            const band = div('wb-requests-band');
            band.style.left = `${startPercent}%`;
            band.style.width = `${endPercent - startPercent}%`;
            const label = document.createElement('span');
            // The turn's first elapsed time, as in the table's Start column.
            const startMs =
              events.find((frame) => frame.turn === turn)?.elapsedMs ?? 0;
            label.textContent = `Turn ${turn} · ${(startMs / 1000).toFixed(1)} s`;
            band.append(label);
            return band;
          }),
      );
      bars.replaceChildren(
        ...exchanges.flatMap((exchange) =>
          exchangeBars(exchange, events, axis).map(({ lane, left, width }) => {
            const bar = div('wb-requests-bar');
            bar.dataset.lane = lane;
            bar.style.left = `${left}%`;
            bar.style.width = `${width}%`;
            return bar;
          }),
        ),
      );
    },
    dispose: detachScrub,
  };
}
