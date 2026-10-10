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
 * Cleans a short model-written label, never streamed prose. A spaced dash
 * (en, em or hyphen) becomes ", "; an en or em dash joining two words with no
 * spaces ("5-10", "Seattle-Tacoma") becomes a hyphen; plain hyphens stay.
 * Whitespace collapses, and leading or trailing dashes and commas are removed.
 */
export function plainLabel(text: string): string {
  return text
    .replace(/\s+[\u2013\u2014-]\s+/g, ', ')
    .replace(/(?<=\w)[\u2013\u2014](?=\w)/g, '-')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,\u2013\u2014-]+|[\s,\u2013\u2014-]+$/g, '');
}
