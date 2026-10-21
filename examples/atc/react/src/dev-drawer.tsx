import {
  clampDrawerHeight,
  DEV_TABS,
  type DevFilter,
  type DevStorage,
  devTabBlocks,
  type DevTabId,
  readDrawerHeight,
  sendActivity,
  shownTurn,
  writeDrawerHeight,
} from '@atc/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDevFeed, useDevMode } from './dev-mode';

/** How far an arrow key moves the drag handle, in pixels. */
const KEY_STEP = 24;

/** No filter run and nothing on the map. */
const NO_FILTER: DevFilter = { run: null, applied: null };

/**
 * The developer drawer under the map: tabs for the router, the cards
 * decision, the filter, the streaming UI JSON and the tool calls of the shown
 * send (the newest, or an answer picked in the chat until "Latest"). It only
 * reports; nothing in it changes the app. Everything is text (never HTML) and
 * the drawer is not a live region. Its top edge drags to resize it, clamped
 * to its column and remembered. `filter` is the Filter tab's input
 * (`devFilter`), from the app. Renders nothing while dev mode is off.
 */
export function DevDrawer({ filter = NO_FILTER }: { filter?: DevFilter }) {
  return useDevMode().on ? <DrawerPanel filter={filter} /> : null;
}

function DrawerPanel({ filter }: { filter: DevFilter }) {
  const dev = useDevMode();
  const feed = useDevFeed();
  const [tab, setTab] = useState<DevTabId>('router');
  const ids = useId();
  const tabsRef = useRef<HTMLDivElement>(null);

  const { items, turns, busy } = feed.chat;
  const shown = shownTurn(turns, dev.selection);
  const activity = useMemo(
    () => sendActivity(items, turns, shown, busy),
    [items, turns, shown, busy],
  );
  const blocks = devTabBlocks(tab, {
    typing: feed.typing,
    turn: shown === null ? undefined : turns[shown],
    answer: activity.answer,
    tools: activity.tools,
    filter,
  });
  const size = useDrawerHeight(dev.storage);

  const moveTab = (event: KeyboardEvent, index: number) => {
    const last = DEV_TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % DEV_TABS.length
        : event.key === 'ArrowLeft'
          ? (index + last) % DEV_TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(DEV_TABS[next].id);
    tabsRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  };

  return (
    <section
      ref={size.ref}
      className="atc-dev-drawer"
      aria-label="Developer tools"
      aria-live="off"
      data-testid="dev-drawer"
      style={size.style}
    >
      <div
        className="atc-dev-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize developer tools"
        aria-valuenow={size.height ?? undefined}
        aria-valuemin={size.min ?? undefined}
        aria-valuemax={size.max ?? undefined}
        tabIndex={0}
        {...size.handlers}
      />
      <div className="atc-dev-tabs">
        <div className="atc-dev-tablist" role="tablist" ref={tabsRef}>
          {DEV_TABS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${ids}-${entry.id}`}
              className="atc-dev-tab"
              aria-selected={tab === entry.id}
              aria-controls={`${ids}-panel`}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {dev.selection.follow ? null : (
          <button
            type="button"
            className="atc-dev-tab atc-dev-latest"
            onClick={dev.follow}
          >
            Latest
          </button>
        )}
      </div>
      <div
        className="atc-dev-body"
        role="tabpanel"
        id={`${ids}-panel`}
        aria-labelledby={`${ids}-${tab}`}
        tabIndex={0}
      >
        {blocks.map((block, index) => (
          <section key={index} className="atc-dev-block">
            <p className="atc-dev-title">{block.title}</p>
            <pre>{block.text}</pre>
          </section>
        ))}
      </div>
      <button
        type="button"
        className="atc-dev-close"
        aria-label="Close developer tools"
        onClick={dev.toggle}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </section>
  );
}

/** The height of the column the drawer sits in, or 0 when it has none. */
function columnHeight(drawer: HTMLElement | null): number {
  return drawer?.parentElement?.getBoundingClientRect().height ?? 0;
}

/**
 * The drawer's height: the remembered one (or the default share), clamped to
 * the column the drawer sits in. The column is measured on mount, whenever it
 * resizes (a ResizeObserver, plus window resize), and on every drag; a column
 * with no height (phones, where the drawer is a sheet) leaves the height to
 * the stylesheet. A drag uses the primary button only and stops text
 * selection while it runs; the height is remembered when a drag ends or is
 * cancelled, or a key moves it (arrows step, Home and End go to the limits).
 */
function useDrawerHeight(storage: DevStorage | null) {
  const ref = useRef<HTMLElement>(null);
  const [wanted, setWanted] = useState(() => readDrawerHeight(storage));
  const [column, setColumn] = useState(0);
  const drag = useRef<{ y: number; from: number; to: number } | null>(null);

  useEffect(() => {
    const measure = () => setColumn(columnHeight(ref.current));
    measure();
    const parent = ref.current?.parentElement;
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (parent) observer?.observe(parent);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  // A drag in progress when the drawer closes must not leave selection off.
  useEffect(
    () => () => {
      if (drag.current !== null) endSelectionBlock();
    },
    [],
  );

  const height = column > 0 ? clampDrawerHeight(wanted, column) : null;
  const style =
    height === null
      ? undefined
      : ({ '--atc-drawer-height': `${height}px` } as CSSProperties);
  const measureNow = () => {
    const px = columnHeight(ref.current);
    setColumn(px);

    return px;
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    const end = drag.current;
    if (end === null) return;
    drag.current = null;
    endSelectionBlock();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    writeDrawerHeight(storage, end.to);
  };
  const keyTo = (event: KeyboardEvent<HTMLElement>, px: number) => {
    event.preventDefault();
    const next = clampDrawerHeight(px, measureNow());
    setWanted(next);
    writeDrawerHeight(storage, next);
  };

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const columnPx = measureNow();
      if (columnPx <= 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      document.body.style.userSelect = 'none';
      const from = clampDrawerHeight(wanted, columnPx);
      drag.current = { y: event.clientY, from, to: from };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (start === null) return;
      const to = clampDrawerHeight(
        start.from + (start.y - event.clientY),
        measureNow(),
      );
      drag.current = { ...start, to };
      setWanted(to);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (height === null) return;
      if (event.key === 'ArrowUp') keyTo(event, height + KEY_STEP);
      else if (event.key === 'ArrowDown') keyTo(event, height - KEY_STEP);
      else if (event.key === 'Home') keyTo(event, 0);
      else if (event.key === 'End') keyTo(event, Number.MAX_SAFE_INTEGER);
    },
  };

  return {
    ref,
    style,
    height,
    min: column > 0 ? clampDrawerHeight(0, column) : null,
    max: column > 0 ? clampDrawerHeight(Number.MAX_SAFE_INTEGER, column) : null,
    handlers,
  };
}

/** Lets the page select text again after a drag. */
function endSelectionBlock(): void {
  document.body.style.userSelect = '';
}
