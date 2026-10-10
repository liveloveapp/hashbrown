import { AREAS } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import { useEffect, useRef } from 'react';
import { useAtcStore } from './store';

/** The live Leaflet map. */
export function AirspaceMap() {
  const store = useAtcStore();
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let handle: AirspaceMapHandle | undefined;
    if (element.current) {
      void createAirspaceMap({
        element: element.current,
        store,
        area: AREAS.ord,
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
  }, [store]);

  return <div ref={element} className="atc-map" data-testid="airspace-map" />;
}
