import { basename, dirname, join } from 'node:path';
import {
  type AimockFixture,
  type AimockResponse,
  createAimock,
  type FixtureSet,
} from '@b4run/testing';

/**
 * `@b4run/testing` narrows aimock's `match` to three keys, but aimock's router
 * also honours `sequenceIndex`: which occurrence of a matching request the
 * fixture answers, so with `0` each fixture is served at most once.
 */
type SequencedFixture = AimockFixture & {
  readonly match: AimockFixture['match'] & { readonly sequenceIndex?: number };
};

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
 * the FIRST user message, which mismatched for the nested echo call the
 * `render` tool used to make (a fresh one-message request that started a
 * new "turn" from aimock's point of view). The echo is gone; the tapes that
 * still carry its recording replay unchanged, that fixture simply unused.
 *
 * Every fixture also gets `sequenceIndex: 0`. aimock matches `userMessage`
 * by substring, and the LLM judge's user message quotes the case input, so
 * the app's first-turn fixture would otherwise answer the judge too. Served
 * once, it is consumed by the app's call and the judge falls through to its
 * own recording.
 *
 * Responses are kept exactly as recorded. A recording replay would reject is
 * refused by {@link assertReplayable} before it is written, never rewritten.
 */
export function recordingsToFixtures(
  recordings: readonly Recording[],
): FixtureSet {
  return recordings.map((rec): SequencedFixture => {
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
        sequenceIndex: 0,
      },
      response: rec.response,
    };
  });
}

/** The prefix aimock puts on the error it throws for fixtures it refuses. */
const REFUSED = 'Fixture validation failed: ';

/** One problem aimock's loader reports, as it serializes them in that error. */
interface LoadIssue {
  readonly severity?: string;
  readonly fixtureIndex?: number;
  readonly message?: string;
}

/**
 * Name each refused turn by its conversation position and user message,
 * falling back to aimock's own message when it is not in the shape above.
 */
function describeRefusal(fixtures: FixtureSet, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.startsWith(REFUSED)) return raw;
  let issues: unknown;
  try {
    issues = JSON.parse(raw.slice(REFUSED.length));
  } catch {
    return raw;
  }
  if (!Array.isArray(issues)) return raw;
  const turns = (issues as LoadIssue[])
    .filter((issue) => issue.severity === 'error')
    .map((issue) => {
      const match =
        issue.fixtureIndex === undefined
          ? undefined
          : fixtures[issue.fixtureIndex]?.match;
      const where =
        match === undefined
          ? `fixture ${issue.fixtureIndex ?? '?'}`
          : `turn ${match.turnIndex ?? '?'}` +
            (match.userMessage === undefined
              ? ''
              : ` of ${JSON.stringify(match.userMessage)}`);
      return `${where}: ${issue.message ?? 'refused'}`;
    });
  return turns.length > 0 ? turns.join('; ') : raw;
}

/**
 * Refuse a tape that replay would reject.
 *
 * aimock validates fixtures whenever it loads them for replay, and refuses
 * some responses a recording can legitimately capture, notably an assistant
 * message whose content is empty. Loading the tape through the same validator
 * before it is written makes such a recording fail now, naming the turn,
 * instead of producing a file the next replay cannot open.
 *
 * `@b4run/testing` applies the same check to its own recordings since
 * cacheplane/b4run#844. This app keys its fixtures itself (see
 * {@link recordingsToFixtures}), so it has to apply the check itself.
 *
 * @param fixtures - The tape about to be written.
 * @returns Resolves when replay would load the tape.
 * @throws Error naming each refused turn and aimock's reason.
 */
export async function assertReplayable(fixtures: FixtureSet): Promise<void> {
  const mock = await createAimock({ fixtures }).catch((error: unknown) => {
    throw new Error(describeRefusal(fixtures, error));
  });
  await mock.close();
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
