/**
 * Words and phrases Brian never uses (spec section 5, "Never"). Matched
 * case-insensitively on word boundaries; spaces match any run of whitespace.
 * Inflections are listed because "leveraging" is as much a tell as "leverage".
 */
export const BANNED_PHRASES: readonly string[] = [
  'delve',
  'delves',
  'delved',
  'delving',
  'leverage',
  'leverages',
  'leveraged',
  'leveraging',
  'seamless',
  'seamlessly',
  'robust',
  'unlock',
  'unlocks',
  'unlocking',
  'elevate',
  'elevates',
  'elevated',
  'elevating',
  'landscape',
  'game-changer',
  'game changer',
  'supercharge',
  'supercharges',
  'supercharged',
  'the future of',
  "in today's",
  "here's the thing",
  'let that sink in',
  "it's not just",
  "i'm thrilled to announce",
];

/**
 * The "not X but Y" cadence. A comma before "but" is ordinary speech ("not
 * sure, but it works"), so only the uncommaed form, or "not just/only X, but",
 * is flagged.
 */
export const BANNED_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  {
    name: 'not X but Y',
    pattern: /\bnot\s+(?:just|only)\s+[^.!?\n]{1,60}?,?\s+but\b/i,
  },
  { name: 'not X but Y', pattern: /\bnot\s+[^.!?\n,;]{1,40}?\s+but\b/i },
];
