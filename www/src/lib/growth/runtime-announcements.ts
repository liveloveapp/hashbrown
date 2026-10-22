import {
  approvedDocumentationUrl,
  runtimeAnnouncementCatalog,
} from '../announcements/catalog';

/** A version-gated notice returned to runtime collectors after a commit. */
export interface RuntimeAnnouncement {
  id: string;
  packageNames: readonly string[];
  minVersion: string;
  maxVersion?: string;
  expiresAt: string;
  text: string;
  documentationUrl?: string;
}

type RuntimePackageBatch = {
  events: readonly { properties: Readonly<Record<string, string>> }[];
};

/** Only numeric release versions have a defined ordering in this small catalog. */
function releaseVersion(value: string): number[] | undefined {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    return undefined;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

function compareVersion(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/**
 * Selects the catalog entries that apply to a committed runtime batch: live,
 * well-formed entries whose package and release range match some event.
 *
 * @param batch - The committed batch.
 * @param now - The time used for expiry and, for the default catalog,
 *   publication.
 * @param entries - The catalog; defaults to the shared announcements catalog.
 * @returns At most five announcements, projected to their public fields.
 */
export function selectRuntimeAnnouncements(
  batch: RuntimePackageBatch,
  now: Date,
  entries: readonly RuntimeAnnouncement[] = runtimeAnnouncementCatalog(now),
): RuntimeAnnouncement[] {
  if (!Number.isFinite(now.getTime())) return [];
  const selected: RuntimeAnnouncement[] = [];
  for (const entry of entries) {
    const minimum = releaseVersion(entry.minVersion);
    const maximum =
      entry.maxVersion === undefined
        ? undefined
        : releaseVersion(entry.maxVersion);
    if (
      !minimum ||
      (entry.maxVersion !== undefined && !maximum) ||
      !(Date.parse(entry.expiresAt) > now.getTime()) ||
      !entry.text.trim() ||
      entry.text.length > 500 ||
      /[<>\p{Cc}]/u.test(entry.text) ||
      (entry.documentationUrl !== undefined &&
        !approvedDocumentationUrl(entry.documentationUrl))
    )
      continue;
    const applies = batch.events.some(({ properties }) => {
      const version = releaseVersion(properties.packageVersion);
      return (
        version &&
        entry.packageNames.includes(properties.packageName) &&
        compareVersion(version, minimum) >= 0 &&
        (!maximum || compareVersion(version, maximum) < 0)
      );
    });
    if (!applies || selected.some(({ id }) => id === entry.id)) continue;
    // Explicit projection prevents internal catalog metadata from entering this public response.
    selected.push({
      id: entry.id,
      packageNames: [...entry.packageNames],
      minVersion: entry.minVersion,
      ...(entry.maxVersion === undefined
        ? {}
        : { maxVersion: entry.maxVersion }),
      expiresAt: entry.expiresAt,
      text: entry.text,
      ...(entry.documentationUrl === undefined
        ? {}
        : { documentationUrl: entry.documentationUrl }),
    });
    if (selected.length === 5) break;
  }
  return selected;
}
