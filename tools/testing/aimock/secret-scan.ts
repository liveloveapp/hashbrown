/** A credential found in recorded text; never carries the value itself. */
export interface CredentialLeak {
  /** `secret` for a configured value, `pattern` for a key shape. */
  readonly kind: 'secret' | 'pattern';
  /** Environment variable name, or the key-shape name. */
  readonly name: string;
}

const KEY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['openai-key', /sk-[A-Za-z0-9_-]{16,}/],
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
  ['google-key', /AIza[0-9A-Za-z_-]{30,}/],
  ['bearer-token', /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ['x-api-key-header', /x-api-key/i],
  ['authorization-header', /authorization/i],
];

/**
 * Find credentials in recorded fixture text.
 *
 * @param text - Contents of a recorded fixture file.
 * @param secrets - Configured secret values keyed by variable name.
 * @returns One entry per matched secret or key shape, in order. Values are
 * never included, so results are safe to print.
 */
export function findCredentialLeaks(
  text: string,
  secrets: Readonly<Record<string, string>>,
): CredentialLeak[] {
  const secretLeaks = Object.entries(secrets)
    .filter(([, value]) => value !== '' && text.includes(value))
    .map(([name]): CredentialLeak => ({ kind: 'secret', name }));
  const patternLeaks = KEY_PATTERNS.filter(([, pattern]) =>
    pattern.test(text),
  ).map(([name]): CredentialLeak => ({ kind: 'pattern', name }));
  return [...secretLeaks, ...patternLeaks];
}

/**
 * Parse `.env` text minimally: `KEY=VALUE` lines, optional `export`, `#`
 * comments and surrounding single or double quotes.
 *
 * @param source - Contents of a `.env` file.
 * @returns The variables as a plain record.
 */
export function parseEnvFile(source: string): Record<string, string> {
  return Object.fromEntries(
    source.split(/\r?\n/).flatMap((line): Array<[string, string]> => {
      const match =
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) return [];
      const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
      return [[match[1], value]];
    }),
  );
}
