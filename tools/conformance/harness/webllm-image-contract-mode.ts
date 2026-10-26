/** Refuses deterministic image contracts unless explicitly selected for a local run. */
export function requireWebLlmImageContracts(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (
    environment['CI'] ||
    environment['LOCAL_LLM_E2E'] !== '1' ||
    environment['LOCAL_LLM_WEBLLM_IMAGES'] !== '1'
  ) {
    throw new Error(
      'WebLLM image contracts require explicit local opt-in with LOCAL_LLM_E2E=1 and LOCAL_LLM_WEBLLM_IMAGES=1; CI is refused.',
    );
  }
}
