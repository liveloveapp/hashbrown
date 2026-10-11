/**
 * The base map: OpenStreetMap's standard raster tiles, shown in grey by the
 * stylesheet. OSM's tiles are free for light use under the OSM tile usage
 * policy (https://operations.osmfoundation.org/policies/tiles/); a deployment
 * with heavy traffic should point `url` at a commercial tile provider.
 *
 * The attribution also credits the aircraft, route and chart data the map
 * shows, and says the chart is not for navigation.
 */
export const TILE_LAYER = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attribution: [
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    'Aircraft data <a href="https://adsb.lol">adsb.lol</a> (<a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>)',
    'Routes <a href="https://vrs-standing-data.adsb.lol">vrs-standing-data.adsb.lol</a>',
    'Airport data <a href="https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/">FAA</a> · diagrams © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) · Not for navigation',
  ].join(' · '),
} as const;
