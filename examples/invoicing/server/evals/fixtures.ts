import { basename, dirname, join } from 'node:path';
import type { AimockFixture, AimockResponse, FixtureSet } from '@b4run/testing';

/**
 * One captured real-model exchange, as `Aimock.getRecordings()` returns it.
 * `@b4run/testing` declares an equivalent `Recording` type in
 * `record-fixtures.d.ts`, but that module is not re-exported from the
 * package's root entry point and the package's `exports` map blocks deep
 * imports, so it can't be reused here — this shape is copied instead.
 */
export interface Recording {
  readonly request: {
    readonly messages?: ReadonlyArray<{
      readonly role: string;
      readonly content: unknown;
    }>;
  };
  readonly response: AimockResponse;
}

/**
 * Key each recording the way aimock actually matches at replay: the
 * request's LAST user message, the number of assistant messages already in
 * the request (`turnIndex`), and whether a tool-role message follows that
 * last user message (`hasToolResult`, scoped to the current turn exactly as
 * aimock's `currentTurnHasToolResult` scopes it). `@b4run/testing`'s own `recordingsToFixtures` keys
 * `turnIndex` by the recording's ordinal in the array and `userMessage` by
 * the FIRST user message, which mismatches for the `render` tool's nested
 * echo call — a fresh one-message request that starts a new "turn" from
 * aimock's point of view.
 */
export function recordingsToFixtures(
  recordings: readonly Recording[],
): FixtureSet {
  return recordings.map((rec): AimockFixture => {
    const messages = rec.request.messages ?? [];
    const lastUserIndex = messages.findLastIndex((m) => m.role === 'user');
    const lastUser = messages[lastUserIndex];
    return {
      match: {
        ...(typeof lastUser?.content === 'string'
          ? { userMessage: lastUser.content }
          : {}),
        turnIndex: messages.filter((m) => m.role === 'assistant').length,
        hasToolResult: messages
          .slice(lastUserIndex + 1)
          .some((m) => m.role === 'tool'),
      },
      response: rec.response,
    };
  });
}

/** `<dir>/<evalBase>.<slug>.fixtures.json`, matching `b4 eval`'s convention. */
export function siblingFixturePath(
  evalFile: string,
  caseName: string | undefined,
  index: number,
): string {
  const slug = (caseName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const evalBase = basename(evalFile).replace(/\.eval\.ts$/, '');
  return join(
    dirname(evalFile),
    `${evalBase}.${slug || `case-${index + 1}`}.fixtures.json`,
  );
}
