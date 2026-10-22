import { z } from 'zod';

import {
  INSTALL_DIGEST_MAX_PACKAGES,
  normalizeGrowthPublicActionOrigin,
} from '../growth.ts';

const APPROVE_INSTALL_PATH = '/_/growth/approve-install';
const APPROVE_TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/u;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function safeText(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !containsControlCharacter(value), {
      message: 'field must not contain control or newline characters',
    });
}

const CandidateSchema = z.object({
  email: safeText(320),
  companyDomain: safeText(253),
  gitDisplayName: safeText(160).nullable(),
  repositoryProvider: safeText(32).nullable(),
  repositoryOwner: safeText(100).nullable(),
  gitConfigOrigin: z.enum(['local', 'global']),
  packages: z
    .array(
      z.object({ packageName: safeText(214), packageVersion: safeText(64) }),
    )
    .max(INSTALL_DIGEST_MAX_PACKAGES),
  installCount: z.number().int().min(1),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  framework: z.enum(['react', 'angular']).nullable(),
  highestMilestone: z.enum([
    'installed',
    'started',
    'streamed',
    'tool',
    'component',
  ]),
  scoreTier: z.enum(['low', 'medium', 'high', 'very_high']),
  /** The signed `founder_approve_install` token the approve link carries. */
  approveToken: z.string().min(1).max(2_000).regex(APPROVE_TOKEN_PATTERN),
});

const PublicActionOriginSchema = z.string().refine(
  (value) => {
    try {
      return normalizeGrowthPublicActionOrigin(value) === value;
    } catch {
      return false;
    }
  },
  { message: 'publicActionOrigin must be a bare HTTPS origin' },
);

const InstallDigestInputSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  publicActionOrigin: PublicActionOriginSchema,
  candidates: z.array(CandidateSchema).min(1).max(200),
  context: z.object({
    since: z.date(),
    anonymousInstallSubjects: z.number().int().min(0),
    ciInstallSubjects: z.number().int().min(0),
  }),
});

/** Input for {@link renderInstallDigest}; each candidate carries its approve token. */
export type InstallDigestInput = z.input<typeof InstallDigestInputSchema>;

function block(
  candidate: z.infer<typeof CandidateSchema>,
  origin: string,
): string {
  const name = candidate.gitDisplayName ? ` (${candidate.gitDisplayName})` : '';
  const lines = [`${candidate.email}${name} — ${candidate.companyDomain}`];
  if (candidate.repositoryProvider && candidate.repositoryOwner) {
    lines.push(
      `Repository: ${candidate.repositoryProvider}/${candidate.repositoryOwner}`,
    );
  }
  lines.push(
    `Packages: ${candidate.packages
      .map((entry) => `${entry.packageName}@${entry.packageVersion}`)
      .join(', ')}`,
    `Installs: ${candidate.installCount}, first ${candidate.firstSeenAt.toISOString()}, last ${candidate.lastSeenAt.toISOString()}`,
    `Framework: ${candidate.framework ?? 'unknown'}`,
    `Highest milestone: ${candidate.highestMilestone}`,
    `Score tier: ${candidate.scoreTier.replace('_', ' ')}`,
    `Git identity: ${
      candidate.gitConfigOrigin === 'local'
        ? 'repository-local config'
        : 'global config'
    }`,
    'Approve outreach (valid 7 days):',
    `${origin}${APPROVE_INSTALL_PATH}?token=${candidate.approveToken}`,
  );
  return lines.join('\n');
}

/** Plain-text founder digest. Never sent to the identities it lists. */
export function renderInstallDigest(candidate: unknown): string {
  const input = InstallDigestInputSchema.parse(candidate);
  const count = input.candidates.length;
  return [
    `Hashbrown install digest for ${input.businessDate}`,
    `${count} new install ${
      count === 1 ? 'identity' : 'identities'
    } with a work-email domain and no contact record.`,
    'This digest does not authorize or schedule any recipient email.',
    'Clicking an approve link creates the contact and enrolls them in the founder sequence.',
    '',
    input.candidates
      .map((entry) => block(entry, input.publicActionOrigin))
      .join('\n\n'),
    '',
    `Not reported: ${input.context.anonymousInstallSubjects} install subjects without identity, ${input.context.ciInstallSubjects} CI install subjects since ${input.context.since.toISOString()}.`,
  ].join('\n');
}
