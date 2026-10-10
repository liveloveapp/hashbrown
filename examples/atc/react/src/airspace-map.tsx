import { AREAS } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import { type RefObject, useEffect, useRef } from 'react';
import { useAtcStore } from './store';

/**
 * The live Leaflet map. `obstruction` is the element that covers the map's
 * lower part on phones (the chat's bottom sheet).
 */
export function AirspaceMap({
  obstruction,
}: {
  obstruction?: RefObject<HTMLElement | null>;
}) {
  const store = useAtcStore();
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let handle: AirspaceMapHandle | undefined;
    if (element.current) {
      void createAirspaceMap({
        element: element.current,
        store,
        area: AREAS.pnw,
        obstruction: () => obstruction?.current ?? null,
        signal: controller.signal,
      }).then((created) => {
        if (controller.signal.aborted) {
          created.destroy();
        } else {
          handle = created;
        }
      });
    }

    return () => {
      controller.abort();
      handle?.destroy();
    };
  }, [store, obstruction]);

  return <div ref={element} className="atc-map" data-testid="airspace-map" />;
}
