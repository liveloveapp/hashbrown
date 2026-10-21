import {
  clampDrawerHeight,
  DEV_TABS,
  devTabBlocks,
  type DevTabId,
  type DevToolInput,
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

/**
 * The developer drawer under the map: tabs for the router, the cards
 * decision, the filter, the streaming UI JSON and the tool calls of the shown
 * send (the newest, or an answer clicked in the chat until "Latest"). It only
 * reports; nothing in it changes the app. Everything is text (never HTML) and
 * the drawer is not a live region. Its top edge drags to resize it, clamped
 * to its column and remembered. `filter` is the filter step, from the app.
 * Renders nothing while dev mode is off.
 */
export function DevDrawer({ filter }: { filter: DevToolInput['filter'] }) {
  return useDevMode().on ? <DrawerPanel filter={filter} /> : null;
}

function DrawerPanel({ filter }: { filter: DevToolInput['filter'] }) {
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
      <div className="atc-dev-tabs" role="tablist" ref={tabsRef}>
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

/**
 * The drawer's height: the remembered one (or the default share), clamped to
 * the column the drawer sits in. The column is measured on mount, on every
 * drag and on window resize; a column with no height (phones, where the
 * drawer is a sheet) leaves the height to the stylesheet. The height is
 * remembered when a drag ends or a key moves it.
 */
function useDrawerHeight(storage: Parameters<typeof readDrawerHeight>[0]) {
  const ref = useRef<HTMLElement>(null);
  const [wanted, setWanted] = useState(() => readDrawerHeight(storage));
  const [column, setColumn] = useState(0);
  const drag = useRef<{ y: number; from: number; to: number } | null>(null);

  const measure = () => {
    const height =
      ref.current?.parentElement?.getBoundingClientRect().height ?? 0;
    setColumn(height);

    return height;
  };
  useEffect(() => {
    const onResize = () => {
      const height =
        ref.current?.parentElement?.getBoundingClientRect().height ?? 0;
      setColumn(height);
    };
    onResize();
    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, []);

  const height = column > 0 ? clampDrawerHeight(wanted, column) : null;
  const style =
    height === null
      ? undefined
      : ({ '--atc-drawer-height': `${height}px` } as CSSProperties);

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const columnPx = measure();
      if (columnPx <= 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const from = clampDrawerHeight(wanted, columnPx);
      drag.current = { y: event.clientY, from, to: from };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (start === null) return;
      const to = clampDrawerHeight(
        start.from + (start.y - event.clientY),
        measure(),
      );
      drag.current = { ...start, to };
      setWanted(to);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const end = drag.current;
      if (end === null) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      writeDrawerHeight(storage, end.to);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step =
        event.key === 'ArrowUp'
          ? KEY_STEP
          : event.key === 'ArrowDown'
            ? -KEY_STEP
            : 0;
      if (step === 0 || height === null) return;
      event.preventDefault();
      const next = clampDrawerHeight(height + step, measure());
      setWanted(next);
      writeDrawerHeight(storage, next);
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
