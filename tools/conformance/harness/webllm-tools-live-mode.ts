import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** Fails closed on implicit runtime/model selection without opening a profile or importing WebLLM. */
export function requireWebLlmToolsLive(
  environment: Readonly<Record<string, string | undefined>>,
): { model: string; modulePath: string; profile: string } {
  if (environment['CI']) throw new Error('WebLLM tools live cannot run in CI.');
  for (const flag of [
    'LOCAL_LLM_E2E',
    'LOCAL_LLM_WEBLLM_TOOLS_LIVE',
    'LOCAL_LLM_DOWNLOAD',
  ]) {
    if (environment[flag] !== '1')
      throw new Error(`Real tools live requires explicit ${flag}=1.`);
  }
  const modulePath = environment['WEBLLM_MODULE_PATH']?.trim();
  const model = environment['WEBLLM_MODEL']?.trim();
  if (!modulePath || !isAbsolute(modulePath))
    throw new Error(
      'WEBLLM_MODULE_PATH must be an absolute application-provided bundle path.',
    );
  if (!model)
    throw new Error(
      'WEBLLM_MODEL must explicitly name an application-selected model; no defaults.',
    );
  return {
    model,
    modulePath,
    profile: join(tmpdir(), 'hashbrown-webllm-vision-profile'),
  };
}
