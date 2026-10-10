import type { Aircraft } from '../aircraft';
import { type AircraftKind, KIND_PATHS } from '../kinds';
import type { AtcState } from '../store';

// SECURITY INVARIANT: marker HTML is built from strings and set as innerHTML
// by Leaflet's divIcon. Only fields the aircraft model validates may go in:
// the hex code, the label, the kind (a closed set) and numbers. Interpolating
// typeCode, description or registration here, or widening the HEX or LABEL
// patterns in aircraft.ts, is an XSS bug. Everything else is set as text.

/** CSS classes for one aircraft marker. */
export function markerClassName(state: AtcState, hex: string): string {
  const classes = ['atc-plane'];
  if (state.selectedHex === hex) {
    classes.push('is-selected');
  }
  if (state.followingHex === hex) {
    classes.push('is-followed');
  }
  if (state.highlighted.size > 0) {
    classes.push(state.highlighted.has(hex) ? 'is-highlighted' : 'is-dimmed');
  }

  return classes.join(' ');
}

/**
 * The parts of a plane's data tag: the label, and the altitude in feet
 * ("4,200"), "GND" on the ground, or null when unknown (the tag then shows the
 * label alone).
 */
function planeTagParts(
  aircraft: Pick<Aircraft, 'label' | 'altitudeFt' | 'onGround'>,
): { label: string; altitude: string | null } {
  const altitude = aircraft.onGround
    ? 'GND'
    : aircraft.altitudeFt === null
      ? null
      : aircraft.altitudeFt.toLocaleString('en-US');

  return { label: aircraft.label, altitude };
}

/**
 * Text of a plane's data tag, exactly as rendered: label and altitude in
 * feet separated by a space, such as "ASA123 4,200", "N352LL GND" on the
 * ground, or just "ASA123" when the altitude is unknown. Built only from
 * validated fields.
 */
export function planeTagText(
  aircraft: Pick<Aircraft, 'label' | 'altitudeFt' | 'onGround'>,
): string {
  const { label, altitude } = planeTagParts(aircraft);

  return altitude === null ? label : `${label} ${altitude}`;
}

/** Classes the store drives; toggled in place, leaving others (is-pulsing). */
const STATE_CLASSES = [
  'is-selected',
  'is-followed',
  'is-highlighted',
  'is-dimmed',
];

/** The silhouette SVG for a kind; the path comes from a closed table. */
function silhouetteSvg(kind: AircraftKind): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${KIND_PATHS[kind]}"/></svg>`;
}

/**
 * Updates an existing marker in place: state classes, rotation, label and
 * tag text (via `textContent`), so the marker is never rebuilt and its pulse
 * and hover survive live track and altitude jitter. Writes only what changed.
 * Never rebuild a marker's HTML on update: `setIcon()` would restart the
 * pulse animation and drop `:hover` under the cursor every 3 s.
 */
export function updatePlane(
  element: HTMLElement | undefined,
  aircraft: Aircraft,
  className: string,
) {
  const plane = element?.querySelector('.atc-plane');
  if (!plane) {
    return;
  }
  const wanted = className.split(' ');
  for (const name of STATE_CLASSES) {
    plane.classList.toggle(name, wanted.includes(name));
  }
  if (plane.getAttribute('data-label') !== aircraft.label) {
    plane.setAttribute('data-label', aircraft.label);
  }
  const body = plane.querySelector<HTMLElement>('.atc-plane-body');
  if (body && body.getAttribute('data-kind') !== aircraft.kind) {
    body.setAttribute('data-kind', aircraft.kind);
    body.innerHTML = silhouetteSvg(aircraft.kind);
  }
  const transform = `rotate(${Math.round(aircraft.trackDeg ?? 0)}deg)`;
  if (body && body.style.transform !== transform) {
    body.style.transform = transform;
  }
  const tag = plane.querySelector('.atc-plane-tag');
  const alt = tag?.querySelector('.atc-plane-alt');
  if (!tag || !alt) {
    return;
  }
  const { label, altitude } = planeTagParts(aircraft);
  const altText = altitude === null ? '' : ` ${altitude}`;
  if (
    tag.firstChild &&
    tag.firstChild !== alt &&
    tag.firstChild.textContent !== label
  ) {
    tag.firstChild.textContent = label;
  }
  if (alt.textContent !== altText) {
    alt.textContent = altText;
  }
}

/** Tag markup: the label, then the altitude in a muted monospace span. */
function tag(aircraft: Aircraft): string {
  const { label, altitude } = planeTagParts(aircraft);

  return `${label}<span class="atc-plane-alt">${altitude === null ? '' : ` ${altitude}`}</span>`;
}

/**
 * Marker HTML: the silhouette for the aircraft's kind (rotated to the track)
 * and a data tag that stays upright beside it. Hex codes and labels are
 * validated by the aircraft model (`^[0-9a-f]{6}$`; `^[A-Z0-9]{1,8}$`), the
 * kind is from a closed set, and altitude is a number, so they are safe to
 * interpolate.
 */
export function planeIconHtml(aircraft: Aircraft, className: string): string {
  const rotation = Math.round(aircraft.trackDeg ?? 0);

  return `<div class="${className}" data-hex="${aircraft.hex}" data-label="${aircraft.label}"><div class="atc-plane-body" data-kind="${aircraft.kind}" style="transform: rotate(${rotation}deg)">${silhouetteSvg(aircraft.kind)}</div><span class="atc-plane-tag">${tag(aircraft)}</span></div>`;
}
