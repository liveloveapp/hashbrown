import type { ApiMember } from './api-report.models';

const OMITTED_MEMBERS = new Set([
  'DevelopmentCollectionDiagnostics',
  'getDevelopmentCollectionDiagnostics',
  'setDevelopmentCollectionEnabled',
  'telemetry',
]);

/**
 * Selects members for the public website reference without changing the
 * package exports or mutating the extracted report.
 *
 * @param members - Extracted API members, including nested declarations.
 * @returns Members without internal or collection-specific entries.
 */
export function filterPublicApiMembers(
  members: readonly ApiMember[],
): ApiMember[] {
  return members
    .filter(({ name }) => !name?.startsWith('ɵ') && !OMITTED_MEMBERS.has(name))
    .map((member) => ({
      ...member,
      members: member.members
        ? filterPublicApiMembers(member.members)
        : undefined,
    }));
}
