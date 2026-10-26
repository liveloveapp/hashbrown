/** Requires explicit local selection of deterministic WebLLM tool contracts. */
export function requireWebLlmToolContracts(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (
    environment['CI'] ||
    environment['LOCAL_LLM_E2E'] !== '1' ||
    environment['LOCAL_LLM_WEBLLM_TOOLS'] !== '1'
  ) {
    throw new Error(
      'WebLLM tool contracts require explicit local opt-in with LOCAL_LLM_E2E=1 and LOCAL_LLM_WEBLLM_TOOLS=1; CI is refused.',
    );
  }
}
