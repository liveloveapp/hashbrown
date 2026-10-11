import type { SurfaceFeature, Surfaces } from '@atc/shared';

type Position = readonly [number, number];

/** Rounds a coordinate to 6 decimals (about 0.1 m). */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

/** Reads [lon, lat] from a GeoJSON position, or null when malformed. */
function toPosition(value: unknown): Position | null {
  const [lon, lat] = asArray(value);

  return typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat)
    ? [round6(lon), round6(lat)]
    : null;
}

/** Reads a GeoJSON polygon's rings, dropping malformed points and rings. */
function toRings(value: unknown): readonly (readonly Position[])[] {
  return asArray(value)
    .map((ring) =>
      asArray(ring).flatMap((p) => {
        const position = toPosition(p);

        return position ? [position] : [];
      }),
    )
    .filter((ring) => ring.length >= 4);
}

/** One ArcGIS GeoJSON layer to polygon features; MultiPolygons are split. */
function layerFeatures(
  layer: unknown,
  kind: 'taxiway' | 'apron' | 'hotspot',
  refOf: (properties: Record<string, unknown>) => string | null,
): readonly SurfaceFeature[] {
  const features = isRecord(layer) ? asArray(layer['features']) : [];

  return features.flatMap((feature) => {
    if (!isRecord(feature) || !isRecord(feature['geometry'])) {
      return [];
    }
    const properties = isRecord(feature['properties'])
      ? feature['properties']
      : {};
    const ref = refOf(properties);
    const { type, coordinates } = feature['geometry'];
    const polygons =
      type === 'Polygon'
        ? [coordinates]
        : type === 'MultiPolygon'
          ? asArray(coordinates)
          : [];

    return polygons.flatMap((polygon) => {
      const rings = toRings(polygon);

      return rings.length > 0
        ? [{ kind, shape: 'polygon' as const, rings, ref }]
        : [];
    });
  });
}

/** A non-empty string for a property, or null. */
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null;

/**
 * Converts the FAA Airport Mapping layers (ArcGIS GeoJSON) for one airport to
 * surfaces. Returns null when the airport has no taxiways, so the caller can
 * fall back to another source.
 */
export function amToSurfaces(
  code: string,
  layers: { taxiways: unknown; aprons: unknown; hotspots: unknown },
): Surfaces | null {
  const taxiways = layerFeatures(layers.taxiways, 'taxiway', (p) => {
    const ref = text(p['DESIGNATOR'])?.split('_')[0] ?? null;

    return ref === null || ref === '' || ref === 'UNK' ? null : ref;
  });
  if (taxiways.length === 0) {
    return null;
  }
  const aprons = layerFeatures(layers.aprons, 'apron', (p) =>
    text(p['DESIGNATOR']),
  );
  const hotspots = layerFeatures(layers.hotspots, 'hotspot', (p) => {
    const id = text(p['HOT_ID']);

    return id === null ? null : `HS ${id}`;
  });

  return {
    code,
    source: 'faa',
    features: [...taxiways, ...aprons, ...hotspots],
  };
}

/** One Overpass way to a feature, or null when it is not drawn. */
function wayToFeature(way: unknown): SurfaceFeature | null {
  if (!isRecord(way) || way['type'] !== 'way' || !isRecord(way['tags'])) {
    return null;
  }
  const tags = way['tags'];
  const points = asArray(way['geometry']).flatMap((p): Position[] => {
    if (!isRecord(p)) {
      return [];
    }
    const { lat, lon } = p;

    return typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
      ? [[round6(lon), round6(lat)]]
      : [];
  });
  if (points.length < 2) {
    return null;
  }
  const aeroway = tags['aeroway'];
  if (aeroway === 'apron') {
    const first = points[0];
    const last = points[points.length - 1];
    const closed = first[0] === last[0] && first[1] === last[1];

    return closed && points.length >= 4
      ? {
          kind: 'apron',
          shape: 'polygon',
          rings: [points],
          ref: text(tags['ref']),
        }
      : null;
  }
  if (aeroway === 'taxiway' || aeroway === 'taxilane') {
    const metres = Number.parseFloat(String(tags['width'] ?? ''));

    return {
      kind: 'taxiway',
      shape: 'line',
      points,
      ref: text(tags['ref']),
      widthFt: Number.isFinite(metres) ? metres / 0.3048 : null,
    };
  }
  if (aeroway === 'holding_position') {
    return {
      kind: 'hold',
      shape: 'line',
      points,
      ref: text(tags['ref']),
      widthFt: null,
    };
  }

  return null;
}

/**
 * Converts an Overpass `out geom` response to surfaces: closed aprons as
 * polygons, taxiways and taxilanes as lines, and holding positions as hold
 * lines. The source is `runways-only` when nothing was kept.
 */
export function osmToSurfaces(code: string, overpass: unknown): Surfaces {
  const elements = isRecord(overpass) ? asArray(overpass['elements']) : [];
  const features = elements.flatMap((element) => {
    const feature = wayToFeature(element);

    return feature ? [feature] : [];
  });

  return {
    code,
    source: features.length > 0 ? 'osm' : 'runways-only',
    features,
  };
}
