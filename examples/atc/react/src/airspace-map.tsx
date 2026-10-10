import { AREAS } from '@atc/shared';
import { type AirspaceMapHandle, createAirspaceMap } from '@atc/shared/map';
import { useEffect, useRef } from 'react';
import { useAtcStore } from './store';

/** The live Leaflet map. */
export function AirspaceMap() {
  const store = useAtcStore();
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handle: AirspaceMapHandle | undefined;
    let cancelled = false;
    if (element.current) {
      void createAirspaceMap({
        element: element.current,
        store,
        area: AREAS.ord,
      }).then((created) => {
        if (cancelled) {
          created.destroy();
        } else {
          handle = created;
        }
      });
    }

    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [store]);

  return <div ref={element} className="atc-map" data-testid="airspace-map" />;
}
