'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Sdk } from '@/lib/content';
// Type-only: the runtime capture module imports @hashbrownai/core.
import type { WorkbenchCapture } from '../../../examples/quickstart/runtime/workbench-capture';
import type { WorkbenchChildMessage } from '../../../examples/quickstart/runtime/workbench-messages';
import { SEE_IT_RUN_EVENT, type SeeItRunDetail } from '../SeeItRunButton';
import { createEmbedClient, type EmbedClient } from './embed-client';
// Type-only: the lesson tables and video catalog stay on the server.
import type {
  WorkbenchLessonId,
  WorkbenchLiveAvailability,
  WorkbenchSourceData,
  WorkbenchSourceHtml,
} from './workbench-lessons';
import styles from './WorkbenchPanel.module.css';
import {
  type WorkbenchSourceLoad,
  WorkbenchSourceView,
} from './WorkbenchSourceView';

/**
 * Plain values for {@link WorkbenchPanelClient}, computed on the server by
 * `WorkbenchPanel` so the client bundle carries no lesson tables or catalog.
 */
export interface WorkbenchPanelClientProps {
  readonly lesson: WorkbenchLessonId;
  readonly sdk: Sdk;
  /** The workbench origin frames load from and messages must come from. */
  readonly origin: string;
  /** The recorded video's media id (also names the capture and poster). */
  readonly mediaId: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Whether a capture is published; without one Replay shows the video. */
  readonly hasCapture: boolean;
  /** Whether the capture starts after a reload the video includes. */
  readonly partialCapture: boolean;
  readonly availability: WorkbenchLiveAvailability;
  /** The hosted workbench link, or null when the hosted site lacks the lesson. */
  readonly openHref: string | null;
  /** The recorded video, rendered on the server. */
  readonly fallback: ReactNode;
  /**
   * The lesson's files and the page's highlights; the Source tab is hidden
   * without it. The highlighted files load when the tab first opens.
   */
  readonly source?: WorkbenchSourceData;
  /** Milestones the page's prose refers to (unused until moments land). */
  readonly moments?: readonly string[];
}

type Tab = 'replay' | 'live' | 'source';
type Ready = Extract<WorkbenchChildMessage, { type: 'hb-workbench:ready' }>;

const NARROW_QUERY = '(max-width: 799px)';
// Taller than the 16:10 recordings: a docs column is narrow, and the embed
// needs room for chat, inspector and player. The poster holds the same box.
const FRAME_RATIO = '4 / 3';
// How long a frame gets to say ready, and then to load the capture.
const LOAD_TIMEOUT_MS = 8000;
// How long the capture fetch (up to 1.3 MB) may take.
const FETCH_TIMEOUT_MS = 30_000;
const TAB_LABELS: Record<Tab, string> = {
  replay: 'Replay',
  live: 'Live',
  source: 'Source',
};

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia?.(NARROW_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia?.(NARROW_QUERY).matches ?? false,
    () => false,
  );
}

// A ready from a frame showing another mode, lesson or framework is a broken
// embed, not a slow one.
function readyFor(
  message: Ready,
  mode: Ready['mode'],
  lesson: WorkbenchLessonId,
  sdk: Sdk,
): boolean {
  return (
    message.mode === mode &&
    message.lesson === lesson &&
    message.framework === sdk
  );
}

// Scroll the panel into view and mark the snippet the reader jumped from,
// clearing any earlier mark. Returns the snippet's element, if there is one.
function revealSnippet(
  panel: HTMLElement | null,
  detail: SeeItRunDetail,
): HTMLElement | null {
  panel?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  document
    .querySelectorAll('[data-highlighted][data-component="code-example"]')
    .forEach((element) => element.removeAttribute('data-highlighted'));
  const snippet = document.getElementById(detail.snippet);
  snippet?.setAttribute('data-highlighted', '');
  return snippet;
}

// Calls `onRun` for each See it run event on the page. One panel per page.
function useSeeItRun(onRun: (detail: SeeItRunDetail) => void) {
  useEffect(() => {
    const listener = (event: Event) =>
      onRun((event as CustomEvent<SeeItRunDetail>).detail);
    document.addEventListener(SEE_IT_RUN_EVENT, listener);
    return () => document.removeEventListener(SEE_IT_RUN_EVENT, listener);
  }, [onRun]);
}

/**
 * The interactive half of the docs workbench panel: tabs, lazy frames and the
 * replay load protocol. Falls back to the server-rendered video.
 */
export function WorkbenchPanelClient(props: WorkbenchPanelClientProps) {
  const narrow = useNarrow();
  const openLink = props.openHref && (
    <a
      className={styles.open}
      href={props.openHref}
      target="_blank"
      rel="noopener noreferrer"
    >
      Open full workbench <span aria-hidden="true">↗</span>
    </a>
  );
  if (narrow) {
    return (
      <NarrowPanel>
        {props.fallback}
        {openLink}
      </NarrowPanel>
    );
  }
  return <TabbedPanel {...props} openLink={openLink} />;
}

// The video fallback has nothing to seek: See it run only scrolls and marks.
function NarrowPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useSeeItRun(
    useCallback((detail) => {
      revealSnippet(panel.current, detail);
      panel.current?.focus({ preventScroll: true });
    }, []),
  );
  return (
    <div
      className={styles.panel}
      data-component="workbench-panel"
      tabIndex={-1}
      ref={panel}
    >
      {children}
    </div>
  );
}

function TabbedPanel({
  lesson,
  sdk,
  origin,
  mediaId,
  title,
  width,
  height,
  hasCapture,
  partialCapture,
  availability,
  openHref,
  fallback,
  source,
  openLink,
}: WorkbenchPanelClientProps & { openLink: ReactNode }) {
  const id = useId();
  const tabs: readonly Tab[] = source
    ? ['replay', 'live', 'source']
    : ['replay', 'live'];
  const [tab, setTab] = useState<Tab>('replay');
  const [liveMounted, setLiveMounted] = useState(false);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [liveFrame, setLiveFrame] = useState<HTMLIFrameElement | null>(null);
  const [sourceLoad, setSourceLoad] = useState<WorkbenchSourceLoad>({
    status: 'idle',
  });
  const [snippetFile, setSnippetFile] = useState<{
    path: string;
    seq: number;
  } | null>(null);
  const sourceRequested = useRef(false);
  const client = useRef<EmbedClient | null>(null);
  const isLoaded = useRef(false);
  const pendingMoment = useRef<string | null>(null);
  const lastMoment = useRef<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());

  // Mount the replay frame only as the panel nears the viewport.
  useEffect(() => {
    const element = panel.current;
    if (near || !hasCapture || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setNear(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, hasCapture]);

  // Fetch the capture after the frame is ready and load it. Fall back to the
  // video on no ready, a ready for another embed, a failed or hung fetch, no
  // answer to load, or a rejected load.
  useEffect(() => {
    if (!frame) return;
    let disposed = false;
    const controller = new AbortController();
    const fail = () => {
      if (!disposed) setFailed(true);
    };
    // Bounds ready, then (restarted after posting load) the loaded answer.
    let timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    let fetchTimer: ReturnType<typeof setTimeout> | undefined;
    const fetchCapture = () => {
      // The fetch gets its own limit; a slow capture is not a silent frame.
      fetchTimer = setTimeout(() => {
        controller.abort();
        fail();
      }, FETCH_TIMEOUT_MS);
      return fetch(`/video/docs/${mediaId}-capture.json`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<WorkbenchCapture>;
        })
        .finally(() => clearTimeout(fetchTimer));
    };
    let capture: Promise<WorkbenchCapture> | null = null;
    isLoaded.current = false;
    const embed = createEmbedClient(frame, origin, {
      // StrictMode and reloads can say ready twice; load again each time.
      ready: (message) => {
        clearTimeout(timer);
        isLoaded.current = false;
        // A reload restarts the replay: seek back to where the reader was.
        pendingMoment.current = lastMoment.current;
        if (!readyFor(message, 'replay', lesson, sdk)) return fail();
        capture ??= fetchCapture();
        capture.then((value) => {
          if (disposed) return;
          embed.post({
            type: 'hb-workbench:load',
            version: 1,
            capture: value,
          });
          clearTimeout(timer);
          timer = setTimeout(fail, LOAD_TIMEOUT_MS);
        }, fail);
      },
      loaded: () => {
        clearTimeout(timer);
        isLoaded.current = true;
        // A See it run that came before the replay loaded seeks now.
        const moment = pendingMoment.current;
        pendingMoment.current = null;
        if (moment) {
          embed.post({
            type: 'hb-workbench:seek',
            version: 1,
            milestone: moment,
          });
        }
      },
      // A refused seek leaves the loaded replay where it was; only a
      // refused load falls back to the video.
      rejected: (message) => {
        if (message.reason !== 'milestone') fail();
      },
      state: () => undefined,
    });
    client.current = embed;
    return () => {
      disposed = true;
      isLoaded.current = false;
      client.current = null;
      clearTimeout(timer);
      clearTimeout(fetchTimer);
      controller.abort();
      embed.dispose();
    };
  }, [frame, origin, mediaId, lesson, sdk]);

  // See it run: show the Replay (mounting it if need be), seek once it has
  // loaded, mark the snippet and point Source at the snippet's file. A page
  // with no working replay still scrolls and marks.
  useSeeItRun(
    useCallback(
      (detail) => {
        const snippet = revealSnippet(panel.current, detail);
        setTab('replay');
        // The reader jumped away from the button: carry focus to the Replay.
        tabRefs.current.get('replay')?.focus({ preventScroll: true });
        const header = snippet?.dataset['header'];
        if (header)
          setSnippetFile((last) => ({
            path: header,
            seq: (last?.seq ?? 0) + 1,
          }));
        if (!hasCapture || failed) return;
        lastMoment.current = detail.moment;
        setNear(true);
        if (isLoaded.current && client.current) {
          client.current.post({
            type: 'hb-workbench:seek',
            version: 1,
            milestone: detail.moment,
          });
        } else {
          pendingMoment.current = detail.moment;
        }
      },
      [hasCapture, failed],
    ),
  );

  // The live frame must say ready for this lesson and SDK, or it is replaced
  // by a note and the hosted link: never a blank or broken frame.
  useEffect(() => {
    if (!liveFrame) return;
    let disposed = false;
    const fail = () => {
      if (!disposed) setLiveFailed(true);
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    const client = createEmbedClient(liveFrame, origin, {
      ready: (message) => {
        clearTimeout(timer);
        if (!readyFor(message, 'live', lesson, sdk)) fail();
      },
      loaded: () => undefined,
      rejected: () => undefined,
      state: () => undefined,
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      client.dispose();
    };
  }, [liveFrame, origin, lesson, sdk]);

  // The highlighted source loads the first time the reader opens the Source
  // tab, never before, and only once.
  const openSource = () => {
    if (sourceRequested.current) return;
    sourceRequested.current = true;
    setSourceLoad({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    fetch(`/workbench-source/${sdk}/${lesson}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<WorkbenchSourceHtml>;
      })
      .then((value) => {
        if (!Array.isArray(value?.files)) throw new Error('No files');
        setSourceLoad({ status: 'loaded', files: value.files });
      })
      .catch(() => setSourceLoad({ status: 'failed' }))
      .finally(() => clearTimeout(timer));
  };
  // Focus and selection move freely; only an explicit activation (a click,
  // Enter or Space) mounts the live frame and so spends anything. Showing
  // Source by any means loads it, so its panel is never blank.
  const select = (next: Tab) => {
    setTab(next);
    if (next === 'source') openSource();
  };
  const activate = (next: Tab) => {
    select(next);
    if (next === 'live') setLiveMounted(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(tab);
      return;
    }
    const index = tabs.indexOf(tab);
    const next = {
      ArrowRight: tabs[(index + 1) % tabs.length],
      ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs[tabs.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    select(next);
    tabRefs.current.get(next)?.focus();
  };
  const panelProps = (name: Tab) => ({
    role: 'tabpanel',
    id: `${id}-${name}-panel`,
    'aria-labelledby': `${id}-${name}-tab`,
    hidden: tab !== name,
    className: styles.view,
  });

  return (
    <div className={styles.panel} data-component="workbench-panel" ref={panel}>
      <div className={styles.bar}>
        <div
          role="tablist"
          aria-label={`${title} workbench`}
          className={styles.tabs}
          onKeyDown={onKeyDown}
        >
          {tabs.map((name) => (
            <button
              key={name}
              ref={(button) => {
                if (button) tabRefs.current.set(name, button);
                else tabRefs.current.delete(name);
              }}
              type="button"
              role="tab"
              id={`${id}-${name}-tab`}
              aria-selected={tab === name}
              aria-controls={`${id}-${name}-panel`}
              tabIndex={tab === name ? 0 : -1}
              className={styles.tab}
              onClick={() => activate(name)}
            >
              {TAB_LABELS[name]}
            </button>
          ))}
        </div>
        {openLink}
      </div>
      <div {...panelProps('replay')}>
        {!hasCapture || failed ? (
          fallback
        ) : near ? (
          <>
            <iframe
              ref={setFrame}
              className={styles.frame}
              style={{ aspectRatio: FRAME_RATIO }}
              src={`${origin}/${sdk}.html?lesson=${lesson}&embed=replay`}
              title={`Hashbrown workbench replay: ${title}`}
            />
            {partialCapture && (
              <p className={styles.note}>
                This replay starts after the page reload; the video shows the
                whole run.
              </p>
            )}
          </>
        ) : (
          <img
            className={styles.frame}
            style={{ aspectRatio: FRAME_RATIO }}
            src={`/video/docs/${mediaId}-poster.png`}
            width={width}
            height={height}
            alt=""
            loading="lazy"
          />
        )}
      </div>
      <div {...panelProps('live')}>
        {!availability.live ? (
          <p className={styles.loopback}>
            This lesson runs only on a local server.{' '}
            <a href={availability.href}>Run the example locally</a>.
          </p>
        ) : liveFailed ? (
          <p className={styles.loopback}>
            Couldn&apos;t load the live workbench.
            {openHref && (
              <>
                {' '}
                <a href={openHref} target="_blank" rel="noopener noreferrer">
                  Open the full workbench
                </a>
                .
              </>
            )}
          </p>
        ) : liveMounted ? (
          <iframe
            ref={setLiveFrame}
            className={styles.frame}
            style={{ aspectRatio: FRAME_RATIO }}
            src={`${origin}/${sdk}.html?lesson=${lesson}&embed=live`}
            title={`Hashbrown workbench live: ${title}`}
            allow="language-model; clipboard-write"
          />
        ) : (
          <p className={styles.loopback}>
            <button
              type="button"
              className={styles.tab}
              onClick={() => activate('live')}
            >
              Start the live workbench
            </button>
          </p>
        )}
      </div>
      {source && (
        <div {...panelProps('source')}>
          <WorkbenchSourceView
            source={source}
            load={sourceLoad}
            visible={tab === 'source'}
            select={snippetFile}
          />
        </div>
      )}
    </div>
  );
}
