import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  qualifyNpmCandidate,
  qualifyNugetCandidate,
} from '../candidate-consumer/qualify.mjs';
import { qualifyPublicNpm, qualifyPublicNuget } from './qualify.mjs';

/** Executes the actual native ESM qualifiers without CommonJS/Jest import translation or credential inheritance. */
export async function qualifyReleaseRecoveryPair(
  mode,
  npmPointer,
  nugetPointer,
) {
  if (!['candidate', 'public'].includes(mode))
    throw new Error('RECOVERY_SELECTION_INVALID');
  const npm = await (
    mode === 'candidate' ? qualifyNpmCandidate : qualifyPublicNpm
  )(npmPointer);
  const nuget = await (
    mode === 'candidate' ? qualifyNugetCandidate : qualifyPublicNuget
  )(nugetPointer);
  return { npm, nuget };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, npm, nuget] = process.argv.slice(2);
  if (process.argv.length !== 5) throw new Error('RECOVERY_SELECTION_INVALID');
  qualifyReleaseRecoveryPair(mode, npm, nuget).then(
    (value) => process.stdout.write(JSON.stringify(value)),
    () => {
      process.stderr.write('RECOVERY_SELECTION_INVALID\n');
      process.exitCode = 1;
    },
  );
}
