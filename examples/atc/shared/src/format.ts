import type { Aircraft } from './aircraft';

/** "35,000 ft", "On ground" or "—". */
export function formatAltitude(
  aircraft: Pick<Aircraft, 'altitudeFt' | 'onGround'>,
): string {
  if (aircraft.onGround) {
    return 'On ground';
  }

  return aircraft.altitudeFt === null
    ? '—'
    : `${aircraft.altitudeFt.toLocaleString('en-US')} ft`;
}

/** "492 kt" or "—". */
export function formatSpeed(kt: number | null): string {
  return kt === null ? '—' : `${Math.round(kt)} kt`;
}

/** A three-digit heading such as "005°", or "—". */
export function formatHeading(deg: number | null): string {
  return deg === null
    ? '—'
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
