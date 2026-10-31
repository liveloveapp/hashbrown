/** Canonical source repository for retained evidence links. */
export const repository = 'https://github.com/liveloveapp/hashbrown';
const escapeInline = (value) =>
  String(value)
    .replace(/[&<>|[\]`*_\\]/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/\r?\n/g, ' ');
/** Escape untrusted prose, including leading Markdown block syntax. */
export const escape = (value) =>
  escapeInline(value)
    .replace(/^(\s*)#/, '$1&#35;')
    .replace(
      /^(\s*)([-+])(?=\s)/,
      (_, space, marker) => `${space}&#${marker.charCodeAt(0)};`,
    )
    .replace(/^(\s*\d+)\.(?=\s)/, '$1&#46;');
/** Render a text value as escaped inline code, preserving literal version syntax. */
export const code = (value) => `<code>${escapeInline(value)}</code>`;
const link = (label, path, commit) =>
  `[${escape(label)}](${repository}/blob/${commit}/${path.split('/').map(encodeURIComponent).join('/')})`;
/** Render a compact Markdown table from already escaped cells. */
export const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
const labels = {
  actualServerToolExecution: 'Actual server tool execution',
  canonicalConsumerRestore: 'Canonical consumer restore',
  reactDisplay: 'React tool display',
  angularDisplay: 'Angular tool display',
  sameNameClientNotReexecuted: 'Same-name client tool stays inert',
  liveStartBeforeToolCompletion: 'Tool start before completion',
  nativeCheckpointRestore: 'Native checkpoint restore',
  activities: 'Native activities',
  subagents: 'Attributed subagents',
  citationsAndAttribution: 'Citations and attribution',
  nativeChildExecution: 'Native child execution',
  liveActivityBeforeToolCompletion: 'Activity before tool completion',
};
const source = (reference, commit) =>
  `${link(reference.path.split('/').at(-1), reference.path, commit)} (SHA-256 ${code(reference.sha256.slice(0, 12))})`;

/** Render one historically qualified native profile and its retained evidence. */
export function qualifiedProfile(profile) {
  const q = profile.qualification;
  const anchor = profile.id.replace(/[^a-zA-Z0-9-]/g, '-');
  const reference = (item) => {
    const index = q.sources.findIndex((source) => source.path === item.path);
    return `S${index + 1}`;
  };
  const stages = [
    ...new Set(
      q.claims.flatMap((claim) => claim.evidence.map((item) => item.stage)),
    ),
  ];
  return [
    `### ${escape(profile.id)}`,
    '',
    'Last qualified configuration; native profile, partial evidence only.',
    '',
    table(
      ['Configuration', 'Recorded value'],
      [
        ['Profile ID', code(profile.id)],
        [
          'Framework / profile',
          `${escape(profile.framework)} / ${escape(profile.profile)}`,
        ],
        ['Last qualified', escape(q.qualifiedAt)],
        [
          'Source commit',
          `[${q.sourceCommit}](${repository}/commit/${q.sourceCommit})`,
        ],
        ['Qualification CI', `[Run ${escape(q.ciRun)}](${q.ciUrl})`],
        ['Runtime', escape(q.runtime ?? 'not-recorded')],
        ['Platform', escape(q.platform ?? 'not-recorded')],
        ['Protocol', escape(q.protocol ?? 'not-recorded')],
        ['Transport', escape(q.transport ?? 'not-recorded')],
        ['Capture', source(q.capture, q.sourceCommit)],
        [
          'Producer source fingerprint',
          code(q.capture.sourceSha256.slice(0, 12)),
        ],
      ],
    ),
    '',
    'Exact dependency versions:',
    '',
    table(
      ['Dependency', 'Version'],
      Object.entries(profile.versions).map(([name, version]) => [
        code(name),
        code(version),
      ]),
    ),
    '',
    `Evidence stage keys: ${stages.map((stage, index) => `E${index + 1} = ${code(stage)}`).join('; ')}. Source keys S1–S${q.sources.length} refer to the unique qualification sources below.`,
    '',
    'Capability cells (scenario IDs identify the reproducible contract):',
    '',
    table(
      ['Capability / scenario', 'Last qualified state and evidence'],
      q.claims.map((claim) => [
        `${escape(labels[claim.capability] ?? claim.capability)}<br />${code(claim.scenarioId)}`,
        `${escape(claim.status)}${claim.evidence.length ? '<br />' + claim.evidence.map((item) => `E${stages.indexOf(item.stage) + 1}: ${escape(item.result)}/${reference(item)}`).join(', ') : ''}`,
      ]),
    ),
    '',
    `Full digests and per-stage basis: [reviewed qualification record](${repository}/blob/main/tools/conformance/agent-frameworks/program/qualification.json), profile ${code(profile.id)}. Digests below show the first 12 SHA-256 characters.`,
    '',
    'Qualification sources:',
    '',
    ...q.sources.map(
      (item, index) =>
        `- <a id="${anchor}-source-${index + 1}"></a>S${index + 1}: ${source(item, q.sourceCommit)}`,
    ),
    '',
  ].join('\n');
}
