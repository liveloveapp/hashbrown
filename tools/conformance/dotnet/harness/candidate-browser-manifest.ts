/** Explicit candidate execution scope; a pilot never claims the full matrix. */
export type CandidateBrowserMode = 'pilot' | 'all';

/** One expected legal browser journey; execution status belongs only to actual results. */
export interface CandidateBrowserRecord {
  readonly id: string;
  readonly composition: string;
  readonly facade: string;
  readonly scenario: string;
}

/** The eight explicitly approved framework/provider/native API compositions. */
export const candidateBrowserCompositions = Object.freeze([
  'react.openai.chat',
  'react.openai.responses',
  'react.azure.chat',
  'react.azure.responses',
  'angular.openai.chat',
  'angular.openai.responses',
  'angular.azure.chat',
  'angular.azure.responses',
]);

const primary = [
  'browser.known-string',
  'browser.known-object',
  'browser.known-null',
  'browser.unavailable',
  'mixed.approve.known',
  'mixed.approve.unavailable',
  'mixed.decline.known',
  'mixed.decline.unavailable',
  'mixed.cancel.known',
  'mixed.cancel.unavailable',
  'multiple.grouped.history',
  'multiple.split.history',
  'restart.before-restore',
  'replica.before-settlement',
  'race.same-revision',
  'local.stale-token',
  'local.incomplete-outcomes',
  'local.incomplete-decisions',
  'local.pending-mutation-gate',
  'failure.ack-disconnect',
  'failure.preack-disconnect',
  'failure.malformed-ack',
  'failure.timeout',
  'failure.cancel-after-ack',
  'failure.definitive-rejection',
  'version.v1',
  'version.malformed.unsupported-capability',
  'version.malformed.mismatched-revision',
  'version.malformed.duplicate-call-ids',
  'version.malformed.missing-call-id',
  'version.malformed.extra-capability-field',
  'version.downgrade',
  'server.busy',
  'server.expired',
  'server.corrupt',
  'server.unknown-effect.dispatch-marker-committed',
  'server.unknown-effect.effect-persisted',
  'display.html',
  'display.reserved-marker',
  'display.near-marker',
  'thread.explicit-new',
] as const;
const siblings = [
  ['structured-chat', 'sibling.known-object'],
  ['completion', 'sibling.known-string'],
  ['structured-completion', 'sibling.known-null'],
  ['ui-completion', 'sibling.with-message-unavailable-cancel'],
  ['ui-chat', 'sibling.unavailable'],
  ['ui-completion', 'sibling.known-object'],
] as const;
const records = Object.freeze(
  candidateBrowserCompositions.flatMap((composition) => [
    ...primary
      .filter(
        (scenario) =>
          scenario !== 'multiple.split.history' ||
          composition.endsWith('.responses'),
      )
      .map((scenario) =>
        Object.freeze({
          id: `${composition}.chat.${scenario}`,
          composition,
          facade: 'chat',
          scenario,
        }),
      ),
    ...siblings.map(([facade, scenario]) =>
      Object.freeze({
        id: `${composition}.${facade}.${scenario}`,
        composition,
        facade,
        scenario,
      }),
    ),
  ]),
);

/** Returns the exact legal immutable expected inventory; it contains no execution claims. */
export function candidateBrowserManifest(
  mode: CandidateBrowserMode,
): readonly CandidateBrowserRecord[] {
  if (mode !== 'pilot' && mode !== 'all')
    throw new Error('Explicit candidate mode pilot or all required');
  return mode === 'all'
    ? records
    : Object.freeze(
        records.filter(
          (record) =>
            record.id === 'react.openai.chat.chat.browser.known-string',
        ),
      );
}
