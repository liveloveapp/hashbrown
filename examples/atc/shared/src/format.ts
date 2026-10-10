import type { Aircraft } from './aircraft';

/** "35,000 ft", "On ground" or "n/a". */
export function formatAltitude(
  aircraft: Pick<Aircraft, 'altitudeFt' | 'onGround'>,
): string {
  if (aircraft.onGround) {
    return 'On ground';
  }

  return aircraft.altitudeFt === null
    ? 'n/a'
    : `${aircraft.altitudeFt.toLocaleString('en-US')} ft`;
}

/** "492 kt" or "n/a". */
export function formatSpeed(kt: number | null): string {
  return kt === null ? 'n/a' : `${Math.round(kt)} kt`;
}

/** A three-digit heading such as "005°", or "n/a". */
export function formatHeading(deg: number | null): string {
  return deg === null
    ? 'n/a'
    : `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
}

/** A 24-hour "HH:MM" clock time. */
export function formatClock(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
}

/**
 * Cleans a short model-written label: em and en dashes (with surrounding
 * spaces) become ", ", and runs of whitespace collapse. For labels such as a
 * board title, never streamed prose.
 */
export function plainLabel(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
