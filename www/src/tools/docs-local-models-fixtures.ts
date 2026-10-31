/** Restricts native inference recording to explicit local execution. */
export function assertLocalRecordingAllowed(ci: string | undefined): void {
  if (ci && !['false', '0'].includes(ci.trim().toLowerCase()))
    throw new Error('Local model recording must run locally, never in CI');
}
