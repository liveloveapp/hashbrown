import type { LonLat } from '../../chart';

/** A `[lon, lat]` (GeoJSON order) position as a Leaflet `[lat, lng]` pair. */
export const toLatLng = ([lon, lat]: LonLat): [number, number] => [lat, lon];
