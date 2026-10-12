/**
 * The chart's identifier and frequency patterns. The server builds its
 * payloads with these and the client parses them with the same ones, so the
 * server never sends what the client drops.
 */

/** An FAA location identifier or ICAO code: 2 to 4 capitals or digits. */
export const IDENT = /^[A-Z0-9]{2,4}$/;

/** A 4-character ICAO code: a capital, then 3 capitals or digits. */
export const ICAO = /^[A-Z][A-Z0-9]{3}$/;

/** A frequency in MHz as text, such as 124.5 or 119.025. */
export const FREQUENCY = /^\d{3}\.\d{1,3}$/;
