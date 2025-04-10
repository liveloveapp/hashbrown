import { getParam, Params } from './env.utils';

export function getOpenAiApiKey() {
  return getParam(Params.OPENAI_API_KEY);
}
