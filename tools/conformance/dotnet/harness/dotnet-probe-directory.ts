import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates a canonical temporary directory for a .NET project-reference probe.
 * MSBuild's transitive relative paths must use the same macOS /var ancestry as
 * the real filesystem path.
 *
 * @param prefix - Prefix for the owned temporary directory.
 * @returns The canonical directory path; callers own its cleanup.
 */
export async function createDotnetProbeDirectory(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}
