'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Sdk } from '@/lib/content';
// Type-only: the runtime capture module imports @hashbrownai/core.
import type { WorkbenchCapture } from '../../../examples/quickstart/runtime/workbench-capture';
import { DOCS_DEMOS } from '../elements/docs-demo-media';
import { DocsDemoVideo } from '../elements/DocsDemoVideo';
import { createEmbedClient } from './embed-client';
import {
  LOOPBACK_LESSONS,
  PARTIAL_CAPTURE_LESSONS,
  WORKBENCH_LESSONS_WITHOUT_CAPTURE,
  type WorkbenchLessonId,
  workbenchLessonTitle,
  workbenchMediaId,
  workbenchOrigin,
  type WorkbenchSourceData,
} from './workbench-lessons';
import styles from './WorkbenchPanel.module.css';

/** Props for {@link WorkbenchPanel}. */
export interface WorkbenchPanelProps {
  readonly lesson: WorkbenchLessonId;
  readonly sdk: Sdk;
  /** Highlighted lesson source; the Source tab is hidden without it. */
  readonly source?: WorkbenchSourceData;
  /** Milestones the page's prose refers to (unused until moments land). */
  readonly moments?: readonly string[];
}

type Tab = 'replay' | 'live' | 'source';

const NARROW_QUERY = '(max-width: 799px)';
// How long the frame gets to say ready, and then to load the capture.
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

/**
 * An inline workbench for a docs page: a Replay of the recorded run, an
 * opt-in Live workbench and, when given, the lesson source. Narrow screens
 * and failed replays get the recorded video instead.
 */
export function WorkbenchPanel(props: WorkbenchPanelProps) {
  const narrow = useNarrow();
  const openLink = (
    <a
      className={styles.open}
      href={`${workbenchOrigin()}/${props.sdk}.html?lesson=${props.lesson}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Open full workbench <span aria-hidden="true">↗</span>
    </a>
  );
  if (narrow) {
    return (
      <div className={styles.panel}>
        <DocsDemoVideo demo={workbenchMediaId(props.lesson, props.sdk)} />
        {openLink}
      </div>
    );
  }
  return <TabbedPanel {...props} openLink={openLink} />;
}

function TabbedPanel({
  lesson,
  sdk,
  source,
  openLink,
}: WorkbenchPanelProps & { openLink: ReactNode }) {
  const id = useId();
  const origin = workbenchOrigin();
  const mediaId = workbenchMediaId(lesson, sdk);
  const title = workbenchLessonTitle(lesson);
  const hasCapture = !WORKBENCH_LESSONS_WITHOUT_CAPTURE.includes(lesson);
  const tabs: readonly Tab[] = source
    ? ['replay', 'live', 'source']
    : ['replay', 'live'];
  const [tab, setTab] = useState<Tab>('replay');
  const [liveMounted, setLiveMounted] = useState(false);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
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
  // video on no ready, a failed or hung fetch, no answer to load, or rejected.
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
    const client = createEmbedClient(frame, origin, {
      // StrictMode and reloads can say ready twice; load again each time.
      ready: () => {
        clearTimeout(timer);
        capture ??= fetchCapture();
        capture.then((value) => {
          if (disposed) return;
          client.post({
            type: 'hb-workbench:load',
            version: 1,
            capture: value,
          });
          clearTimeout(timer);
          timer = setTimeout(fail, LOAD_TIMEOUT_MS);
        }, fail);
      },
      loaded: () => clearTimeout(timer),
      rejected: fail,
      state: () => undefined,
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(fetchTimer);
      controller.abort();
      client.dispose();
    };
  }, [frame, origin, mediaId]);

  const select = (next: Tab) => {
    setTab(next);
    if (next === 'live') setLiveMounted(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
  const media = DOCS_DEMOS[mediaId];
  const { width, height } =
    'dimensions' in media ? media.dimensions : { width: 1440, height: 810 };
  const aspectRatio = `${width} / ${height}`;

  return (
    <div className={styles.panel} ref={panel}>
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
              onClick={() => select(name)}
            >
              {TAB_LABELS[name]}
            </button>
          ))}
        </div>
        {openLink}
      </div>
      <div {...panelProps('replay')}>
        {!hasCapture || failed ? (
          <DocsDemoVideo demo={mediaId} />
        ) : near ? (
          <>
            <iframe
              ref={setFrame}
              className={styles.frame}
              style={{ aspectRatio }}
              src={`${origin}/${sdk}.html?lesson=${lesson}&embed=replay`}
              title={`Hashbrown workbench replay: ${title}`}
            />
            {PARTIAL_CAPTURE_LESSONS.includes(lesson) && (
              <p className={styles.note}>
                This replay starts after the page reload; the video shows the
                whole run.
              </p>
            )}
          </>
        ) : (
          <img
            className={styles.frame}
            style={{ aspectRatio }}
            src={`/video/docs/${mediaId}-poster.png`}
            width={width}
            height={height}
            alt=""
            loading="lazy"
          />
        )}
      </div>
      <div {...panelProps('live')}>
        {LOOPBACK_LESSONS.includes(lesson) ? (
          <p className={styles.loopback}>
            This lesson runs only on a local server.{' '}
            <a href={`/docs/${sdk}/start/workbench#run-the-example`}>
              Run the example locally
            </a>
            .
          </p>
        ) : (
          liveMounted && (
            <iframe
              className={styles.frame}
              style={{ aspectRatio }}
              src={`${origin}/${sdk}.html?lesson=${lesson}&embed=live`}
              title={`Hashbrown workbench live: ${title}`}
            />
          )
        )}
      </div>
      {source && (
        <div {...panelProps('source')}>
          {source.files.map((file) => (
            <figure key={file.path} className={styles.file}>
              <figcaption>{file.path}</figcaption>
              {/* Highlighted at build time from checked-in example source. */}
              <div dangerouslySetInnerHTML={{ __html: file.html }} />
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
