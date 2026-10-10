# atc: All Traffic, Aircraft Kinds and Map-Control Tools

Date: 2026-10-10
Status: approved in conversation
Builds on: `2026-10-09-atc-flagship-demo-design.md`, `2026-10-10-atc-lla-redesign-design.md`

## Goal

Show all aircraft over the Pacific Northwest, not just airliners; draw
single-engine, twin-engine, rotor and jet traffic with different silhouettes;
and let the assistant move the map ("what's flying near KBDN?" zooms to Bend
and lists those aircraft).

## All traffic

- Normalization keeps every aircraft with a valid ICAO hex and a position.
  Owner and operator fields stay stripped.
- Each aircraft gets a display `label`: the airline callsign when there is one
  (`UAL1372`), else the registration (`r`, e.g. `N352LL`), else any other
  callsign, else the hex. Labels are validated to `^[A-Z0-9]{1,8}$` so marker
  HTML stays injection-safe; invalid values fall through to the next source.
- `callsign` becomes optional data (`string | null`); airline name lookups only
  apply to airline callsigns. Cards for non-airline aircraft show type and
  registration with no airline line.
- Registrations are shown for private aircraft (public data, as on every
  flight tracker).

## Aircraft kinds

`aircraftKind(aircraft): 'jet' | 'twin' | 'single' | 'rotor'`, pure and tested:

1. A bundled table of about 80 common ICAO type codes (pistons, turboprops,
   helicopters, business and airline jets) decides when the type is known.
2. Otherwise adsb.lol's `category`: A7 → rotor; A3–A6 → jet; A2 → twin;
   A1 and B-category (gliders, balloons, UAVs) → single.
3. Otherwise jet.

The kind is stored on `Aircraft`, returned in tool rows, and drives the marker
silhouette. Four monoline-friendly SVG silhouettes at the same size: jet
(swept wings, today's icon), twin (straight wings with two engine pods),
single (straight wing, nose prop), rotor (fuselage with rotor disc). All ink,
cobalt when highlighted or selected, dimmed when filtered out.

## Map-control tools (browser-side)

- `lookupPlace({ query })`: resolves an ICAO code, IATA code, name or city
  against a bundled table of about 40 Pacific Northwest airports (KBDN,
  KRDM, KSEA, KPDX, KBOI, KEUG, KMFR, KSLE, KPSC, KYKM, KALW, KGEG, KBLI,
  KPAE, KBFI, KTTD, KHIO, KUAO, KLMT, KOTH, KONP, KAST, KCVO, KSFF, KPUW,
  KLWS, KEAT, KMWH, KRNT, KOLM, KPWT, KTIW, KAWO, KBVS, KPDT, KBKE, KIDA,
  KTWF, KSUN, KMYL as the target set). Returns the airport or `null`.
- `showArea({ airport, radiusNm })`: fits the map to a circle (default 25 nm,
  5–150 nm) around the airport, draws a faint circle outline, and returns how
  many aircraft are inside. Animated unless reduced motion.
- `resetMap()`: returns to the regional view (KBDN, zoom 6) and clears the
  area outline.
- `findAircraft` gains `near: { airport, radiusNm } | null` and
  `kind: 'jet' | 'twin' | 'single' | 'rotor' | null` filters; `approaching`
  stays. Rows include `kind` and `label`.

Map moves happen only on tool calls. Follow mode wins over area moves; a
user drag cancels any pending fit. Zoom-to-fit for highlighted planes
(previous change) still applies.

## Components and prompt

- The ArrivalsBoard is reused for nearby lists; it hides its ETA column when
  none of its aircraft is approaching the board's airport, and its `airport`
  prop accepts any airport code from the place table.
- The system prompt adds: use `lookupPlace` for any place the user names,
  `showArea` to show it, `findAircraft` with `near` to list what's there,
  `resetMap` when asked to zoom out; refer to aircraft by label.

## Hover detail card

Hovering a plane (or selecting it by tap or click) opens one floating detail
card next to it, built with text nodes only. It shows every field adsb.lol
provides that is not owner data, omitting rows with no value:

- Identity: label, registration, ICAO type and readable name, kind, model
  year, callsign, squawk (with emergency status when not "none"), category.
- Altitude: pressure (barometric) altitude, geometric altitude, selected
  altitude, altimeter setting (QNH, hPa and inHg), vertical rate.
- Speed and direction: ground speed, indicated and true airspeed, Mach,
  track, magnetic heading when present.
- Position and freshness: latitude and longitude, seconds since last
  message, and the scheduled route if it has been looked up.

Normalization whitelists these extra adsb.lol fields (`alt_geom`,
`nav_altitude_mcp`, `nav_qnh`, `ias`, `tas`, `mach`, `mag_heading`,
`squawk`, `emergency`, `category`, `year`, `seen`) with type checks; owner
and operator fields (`ownOp`) remain stripped. Figures use the mono tabular
style; the card follows LLA styling (white, 1px border, 10px radius, no
shadow) and stays inside the map bounds.

## Testing

Shared unit tests (normalization label rules and extra fields, detail-card view model, aircraftKind table and
category fallbacks, lookupPlace matching, near/kind filters, view-state
decisions), component tests for label-only cards and the ETA-less board, and
an e2e scenario "What's flying near KBDN?" with synthetic GA, rotor and jet
traffic. Manual check of frame time with several hundred markers.
