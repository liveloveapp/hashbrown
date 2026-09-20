import { basename, dirname, join } from 'node:path';
import type { AimockFixture, AimockResponse, FixtureSet } from '@b4run/testing';

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
 * the FIRST user message, which mismatches for the `render` tool's nested
 * echo call — a fresh one-message request that starts a new "turn" from
 * aimock's point of view.
 *
 * Every fixture also gets `sequenceIndex: 0`. aimock matches `userMessage`
 * by substring, and the LLM judge's user message quotes the case input, so
 * the app's first-turn fixture would otherwise answer the judge too. Served
 * once, it is consumed by the app's call and the judge falls through to its
 * own recording.
 *
 * One recording is also rewritten. Since the system prompt stopped asking for
 * a closing message (the `after` hook in `src/middleware.ts` decides it now),
 * gpt-5-mini ends a run with an empty assistant message, and aimock rejects a
 * fixture whose `content` is the empty string with no `blocks` ("content is
 * empty string"), so the tape could not be replayed at all. Such a recording
 * is stored as `{}` instead: the closing message is inert for this app — the
 * user reads the `render` echo, no scorer looks at `run.finalMessage`, and in
 * production `after` replaces the message whatever it was.
 */
/** A recorded response that says nothing and calls nothing. */
const emptyClosing = (response: AimockResponse): boolean => {
  const { content, toolCalls } = response as {
    content?: unknown;
    toolCalls?: unknown;
  };
  return content === '' && !Array.isArray(toolCalls);
};

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
      response: emptyClosing(rec.response) ? { content: '{}' } : rec.response,
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
