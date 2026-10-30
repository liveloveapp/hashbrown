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
  type WorkbenchSourceSelect,
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
}

type Tab = 'replay' | 'live' | 'source';
type Ready = Extract<WorkbenchChildMessage, { type: 'hb-workbench:ready' }>;

// The `.narrow`/`.wide` media queries in WorkbenchPanel.module.css match this.
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

const isNarrow = () => window.matchMedia?.(NARROW_QUERY).matches ?? false;

function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

const subscribeNever = () => () => undefined;

// False on the server and while hydrating, true once the client renders.
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
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
 *
 * The server cannot know the viewport, so its markup holds both the narrow
 * video panel and the tabbed panel, and CSS media queries show one: a phone
 * never paints tabs or loads the poster. Once hydrated, only the panel for
 * the viewport stays mounted, so a phone mounts no frames or observers.
 */
export function WorkbenchPanelClient(props: WorkbenchPanelClientProps) {
  const hydrated = useHydrated();
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
  return (
    <>
      {(!hydrated || narrow) && (
        <NarrowPanel title={props.title}>
          {props.fallback}
          {openLink}
        </NarrowPanel>
      )}
      {(!hydrated || !narrow) && <TabbedPanel {...props} openLink={openLink} />}
    </>
  );
}

// The video fallback has nothing to seek: See it run only scrolls and marks.
function NarrowPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // The server render leaves the poster unset so desktop never fetches it;
  // apply it once this panel is the one showing.
  useEffect(() => {
    if (!isNarrow()) return;
    panel.current
      ?.querySelectorAll<HTMLVideoElement>('video[data-poster]')
      .forEach((video) => {
        video.poster = video.dataset['poster'] ?? '';
      });
  }, []);
  useSeeItRun(
    useCallback((detail) => {
      // Before hydration both panels listen; only the one showing acts.
      if (!isNarrow()) return;
      revealSnippet(panel.current, detail);
      panel.current?.focus({ preventScroll: true });
    }, []),
  );
  return (
    <div
      className={`${styles.panel} ${styles.narrow}`}
      data-component="workbench-panel"
      role="region"
      aria-label={`${title} workbench`}
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
  // Bumped by Try again, so the retry mounts a fresh live frame.
  const [liveAttempt, setLiveAttempt] = useState(0);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [liveFrame, setLiveFrame] = useState<HTMLIFrameElement | null>(null);
  const [sourceLoad, setSourceLoad] = useState<WorkbenchSourceLoad>({
    status: 'idle',
  });
  const [snippetFile, setSnippetFile] = useState<WorkbenchSourceSelect | null>(
    null,
  );
  const sourceRequested = useRef(false);
  const sourceFetch = useRef<{
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const client = useRef<EmbedClient | null>(null);
  const isLoaded = useRef(false);
  const lastMoment = useRef<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());

  // A Source fetch still running when the panel unmounts (a resize below
  // 800px, a collapsed launcher) is abandoned.
  useEffect(
    () => () => {
      const pending = sourceFetch.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.controller.abort();
    },
    [],
  );

  // Mount the replay frame only as the panel nears the viewport. The
  // hydration pass renders this panel on phones too: never observe there.
  useEffect(() => {
    const element = panel.current;
    if (near || !hasCapture || !element || isNarrow()) return;
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
    // Each ready starts a generation; only the latest one posts load, so a
    // second ready while the capture downloads cannot load twice and undo a
    // seek made after the first load.
    let generation = 0;
    isLoaded.current = false;
    const embed = createEmbedClient(frame, origin, {
      // StrictMode and reloads can say ready twice; load again each time.
      ready: (message) => {
        clearTimeout(timer);
        isLoaded.current = false;
        const current = ++generation;
        if (!readyFor(message, 'replay', lesson, sdk)) return fail();
        capture ??= fetchCapture();
        capture.then((value) => {
          if (disposed || current !== generation) return;
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
        // Every load starts the replay over, so seek back to the last See it
        // run, including one that came before the replay loaded.
        const moment = lastMoment.current;
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
        // Before hydration both panels listen; only the one showing acts.
        if (isNarrow()) return;
        const snippet = revealSnippet(panel.current, detail);
        setTab('replay');
        // The reader jumped away from the button: carry focus to the Replay.
        tabRefs.current.get('replay')?.focus({ preventScroll: true });
        const header = snippet?.dataset['header'];
        if (header)
          setSnippetFile((last) => ({
            path: header,
            seq: (last?.seq ?? 0) + 1,
            lines: detail.lines,
          }));
        if (!hasCapture || failed) return;
        lastMoment.current = detail.moment;
        setNear(true);
        // Before the replay loads, `loaded` seeks to it instead.
        if (isLoaded.current && client.current) {
          client.current.post({
            type: 'hb-workbench:seek',
            version: 1,
            milestone: detail.moment,
          });
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
    sourceFetch.current = { controller, timer };
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
      .finally(() => {
        clearTimeout(timer);
        sourceFetch.current = null;
      });
  };
  // Focus and selection move freely; only an explicit activation (a click,
  // Enter, or Space through the button's own click) mounts the live frame and
  // so spends anything. Showing Source by any means loads it, so its panel is
  // never blank.
  const select = (next: Tab) => {
    setTab(next);
    if (next === 'source') openSource();
  };
  const activate = (next: Tab) => {
    select(next);
    if (next === 'live') setLiveMounted(true);
  };
  // Retry a failed Live with a fresh frame; focus returns to the Live tab,
  // since the button goes away.
  const retryLive = () => {
    setLiveFailed(false);
    setLiveAttempt((attempt) => attempt + 1);
    tabRefs.current.get('live')?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Space is left to the button's native click, which some browsers fire
    // even after a prevented keydown: handling it here would activate twice.
    if (event.key === 'Enter') {
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
    <div
      className={`${styles.panel} ${styles.wide}`}
      data-component="workbench-panel"
      ref={panel}
    >
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
            {availability.reason === 'production-reference' ? (
              <>
                This lesson needs the B4.run Postgres host.{' '}
                <a href={availability.href}>Read the B4.run reference</a>.
              </>
            ) : (
              <>
                This lesson runs only on a local server.{' '}
                <a href={availability.href}>Run the example locally</a>.
              </>
            )}
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
            )}{' '}
            <button type="button" className={styles.tab} onClick={retryLive}>
              Try again
            </button>
          </p>
        ) : liveMounted ? (
          <iframe
            key={liveAttempt}
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
        <div
          {...panelProps('source')}
          // Hold the Replay frame's box while loading, so opening Source
          // never shrinks the panel.
          style={
            sourceLoad.status === 'loading'
              ? { aspectRatio: FRAME_RATIO }
              : undefined
          }
        >
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
