# atc All Traffic, Aircraft Kinds and Map Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all PNW traffic with kind-specific silhouettes and let the assistant move the map to places the user names.

**Architecture:** Data rules (labels, kinds, places, filters, view state) are pure shared functions in `examples/atc/shared/src`; the Leaflet controller renders kinds and area moves; both apps register the new tools in their core files.

**Tech Stack:** TypeScript, Angular 22, React 19, Leaflet 1.9.4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-atc-all-traffic-map-tools-design.md`

## Global Constraints

- Public Hashbrown APIs only; no new dependencies; AGENTS.md test style (top-level `test(...)`, arrange/act/assert) and TSDoc on exports.
- Marker HTML may only interpolate validated values: hex `^[0-9a-f]{6}$`, label `^[A-Z0-9]{1,8}$`, kind from the closed set.
- Owner/operator fields never leave the server.
- LLA design rules (shared design-rules test must pass); one accent colour; no em-dashes or AI-tell phrasing in UI copy or prompts.
- Core files ≤150 lines (`react/src/assistant.tsx`, `angular/src/app/assistant.ts`); Angular/React parity and shared e2e hooks.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or deploy.

## Review Focus

1. Aircraft with no callsign and no registration (hex-only): label, card, tag, tool rows all work.
2. Unknown type with no category: falls back to jet without errors.
3. A place the table doesn't know ("Tokyo", "KJFK"): `lookupPlace` returns null, `showArea` refuses cleanly, the model is told.
4. Following an aircraft while `showArea` is called: follow wins; dragging cancels a pending fit.
5. 500+ markers: no per-frame layout thrash; snapshot updates stay in place.

---

### Task 1: All traffic and display labels

**Files:** `shared/src/aircraft.ts` (+ tests), `shared/src/names.ts`, `shared/src/views.ts`, `shared/src/tools.ts`, `shared/src/map/airspace-map.ts`, `shared/src/contracts.ts`, `server/src` tests, both apps' card components and tests, `e2e/src/fixtures.ts`.

- [ ] Tests first: normalization keeps non-airline aircraft; label precedence airline callsign → registration (`r`) → other callsign → hex; invalid label sources fall through; owner fields stripped; `parseSnapshot` validates the new fields.
- [ ] `Aircraft` gains `label: string` and `registration: string | null`; `callsign: string | null`. Update every consumer (views, tools rows include `label`, map tag uses `label`, cards show airline only for airline callsigns, findAircraft airline filter ignores non-airline traffic).
- [ ] System prompt: refer to aircraft by label; registrations for private aircraft are fine.
- [ ] e2e fixtures include GA and rotor aircraft with registrations and one hex-only aircraft; existing scenarios still pass.
- [ ] Run shared/server/angular/react tests, builds, lint, e2e. Commit `feat(atc): show all traffic with display labels`.

### Task 2: Aircraft kinds and silhouettes

**Files:** `shared/src/kinds.ts` (+ tests), `shared/src/aircraft.ts` (store `category` from adsb.lol if present, validated `^[A-C][0-7]$`), `shared/src/map/airspace-map.ts` (+ tests), `shared/src/styles/atc.css`, `shared/src/tools.ts`.

- [ ] `aircraftKind` pure function per spec (table of ~80 type codes → category → jet), tested for table hits, each category fallback, unknown → jet.
- [ ] Four silhouettes as SVG path data in shared (same 24×24 box); marker HTML picks by kind; in-place updates handle a kind change (rare) by swapping the body SVG.
- [ ] Rows and `findAircraft` gain `kind` (filter + row field), tested.
- [ ] Run tests/builds/lint/e2e; browser check. Commit `feat(atc): aircraft kinds and silhouettes`.

### Task 3: Hover detail card

**Files:** `shared/src/aircraft.ts` (+ tests), `shared/src/views.ts` (`aircraftDetailView`, + tests), `shared/src/map/airspace-map.ts` (+ tests), `shared/src/styles/atc.css`.

- [ ] Tests first: normalization whitelists the extra fields in the spec with type checks (strings validated: squawk `^[0-7]{4}$`, emergency from adsb.lol's closed set, category `^[A-C][0-7]$`, year `^\d{4}$`); `ownOp` still stripped; `parseSnapshot` validates them.
- [ ] `aircraftDetailView(state, hex)` returns grouped label/value rows (identity, altitude, speed and direction, position and freshness) with units and "n/a"-free omission of missing values.
- [ ] Map controller: one shared floating card element per map, built with text nodes, shown on marker hover (desktop) and for the selected aircraft (tap/click), positioned beside the plane and clamped inside the map; updates in place on snapshots; hidden on mouseleave unless selected; Escape clears selection. Reduced motion: no fade.
- [ ] Run tests/builds/lint/e2e; browser check. Commit `feat(atc): hover detail card`.

### Task 4: Places and map-control tools

**Files:** `shared/src/places.ts` (airport table + `lookupPlace`), `shared/src/store.ts` (view request state), `shared/src/tools.ts` (`lookupPlace`, `showArea`, `resetMap`, `near` filter), `shared/src/map/airspace-map.ts` (fit to area, circle outline, reset, interplay with follow and drag), `shared/src/contracts.ts` (prompt; ArrivalsBoard `airport` accepts table codes), both apps' core files (register tools) and ArrivalsBoard (hide ETA when no aircraft approaching), e2e.

- [ ] Tests first: `lookupPlace` matches ICAO/IATA/name/city case-insensitively and returns null for unknown places; `near` filter; view-state reducer (area request, reset, follow precedence, drag cancels).
- [ ] Map controller applies view requests (fitBounds to circle, faint circle outline in `--atc-border`/ink at low opacity, no fill; reset to KBDN zoom 6; animated unless reduced motion).
- [ ] Register `lookupPlace`, `showArea`, `resetMap` in both core files (stay ≤150 lines).
- [ ] ArrivalsBoard hides ETA when none of its aircraft is approaching its airport (both apps, tests).
- [ ] e2e: "What's flying near KBDN?" scenario (aimock calls showArea + findAircraft near + highlight → board) asserts the area circle exists and the board lists the nearby synthetic aircraft, both frameworks.
- [ ] Commit `feat(atc): map-control tools and nearby traffic`.

### Task 5: Final verification

- [ ] `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc www` and `npx nx e2e atc-e2e`.
- [ ] Live check in the browser: all traffic visible with four silhouettes; "What's flying near KBDN?" zooms to Bend and lists aircraft; frame time reasonable with several hundred markers.
