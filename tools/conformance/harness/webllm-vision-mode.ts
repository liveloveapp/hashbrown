import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** Requires explicit local execution/download consent and application-selected runtime/model. */
export function requireWebLlmVisionSmoke(
  environment: Readonly<Record<string, string | undefined>>,
): { model: string; modulePath: string; profile: string } {
  if (environment['CI'])
    throw new Error('WebLLM vision smoke cannot run in CI.');
  for (const flag of [
    'LOCAL_LLM_E2E',
    'LOCAL_LLM_WEBLLM_VISION',
    'LOCAL_LLM_DOWNLOAD',
  ]) {
    if (environment[flag] !== '1')
      throw new Error(`Real vision smoke requires explicit ${flag}=1.`);
  }
  const modulePath = environment['WEBLLM_MODULE_PATH']?.trim();
  const model = environment['WEBLLM_MODEL']?.trim();
  if (!modulePath || !isAbsolute(modulePath))
    throw new Error(
      'WEBLLM_MODULE_PATH must name an absolute application-provided bundle path.',
    );
  if (!model)
    throw new Error(
      'WEBLLM_MODEL is required; vision smoke has no default model.',
    );
  return {
    model,
    modulePath,
    profile: join(tmpdir(), 'hashbrown-webllm-vision-profile'),
  };
}
