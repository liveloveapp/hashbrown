/** Terminal vision evidence collected after application-owned generation cleanup. */
export interface WebLlmVisionTeardown<Snapshot> {
  readonly snapshot?: Snapshot;
  readonly cleanupError?: string;
  readonly evidenceError?: string;
}

/** Drains/disposes before reading and attaching raw evidence, even after failed assertions. */
export async function captureWebLlmVisionTeardown<Snapshot>(options: {
  readonly dispose: () => Promise<void>;
  readonly read: () => Promise<Snapshot>;
  readonly attach: (result: WebLlmVisionTeardown<Snapshot>) => Promise<void>;
}): Promise<WebLlmVisionTeardown<Snapshot>> {
  let cleanupError: string | undefined;
  let evidenceError: string | undefined;
  let snapshot: Snapshot | undefined;
  try {
    await options.dispose();
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error);
  }
  try {
    snapshot = await options.read();
  } catch (error) {
    evidenceError = error instanceof Error ? error.message : String(error);
  }
  const result = {
    ...(snapshot === undefined ? {} : { snapshot }),
    ...(cleanupError === undefined ? {} : { cleanupError }),
    ...(evidenceError === undefined ? {} : { evidenceError }),
  };
  await options.attach(result);
  return result;
}
