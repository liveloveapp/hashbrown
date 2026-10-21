import { AREAS, type MapFilter } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import { type RefObject, useEffect, useRef } from 'react';
import { useAtcStore } from './store';

const NONE: ReadonlySet<keyof MapFilter> = new Set();

/**
 * The live Leaflet map. `obstruction` is the element that covers the map's
 * lower part on phones (the chat's bottom sheet). `streaming` is the set of
 * filter fields the model is still writing, shown on the filter pill, and
 * `notice` is text the pill shows after its chips. The pill's x clears the
 * store's filter, then calls `onClearFilter`.
 */
export function AirspaceMap({
  obstruction,
  streaming = NONE,
  notice = null,
  onClearFilter,
}: {
  obstruction?: RefObject<HTMLElement | null>;
  streaming?: ReadonlySet<keyof MapFilter>;
  notice?: string | null;
  onClearFilter?: () => void;
}) {
  const store = useAtcStore();
  const element = useRef<HTMLDivElement>(null);
  const handleRef = useRef<AirspaceMapHandle | undefined>(undefined);
  const streamingRef = useRef(streaming);
  const noticeRef = useRef(notice);
  const onClearRef = useRef(onClearFilter);

  useEffect(() => {
    const controller = new AbortController();
    let handle: AirspaceMapHandle | undefined;
    if (element.current) {
      void createAirspaceMap({
        element: element.current,
        store,
        area: AREAS.pnw,
        obstruction: () => obstruction?.current ?? null,
        streamingFilter: () => streamingRef.current,
        filterNotice: () => noticeRef.current,
        onClearFilter: () => {
          store.clearMapFilter();
          onClearRef.current?.();
        },
        signal: controller.signal,
      }).then((created) => {
        if (controller.signal.aborted) {
          created.destroy();
        } else {
          handle = created;
          handleRef.current = created;
        }
      });
    }

    return () => {
      controller.abort();
      handle?.destroy();
      handleRef.current = undefined;
    };
  }, [store, obstruction]);

  useEffect(() => {
    onClearRef.current = onClearFilter;
  }, [onClearFilter]);
  // The pill reads the streaming set and the notice through refs; redraw it
  // on change.
  useEffect(() => {
    streamingRef.current = streaming;
    noticeRef.current = notice;
    handleRef.current?.syncFilterPill();
  }, [streaming, notice]);

  return <div ref={element} className="atc-map" data-testid="airspace-map" />;
}
