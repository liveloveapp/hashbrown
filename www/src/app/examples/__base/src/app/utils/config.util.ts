let apiKey = '';
let provider = 'openai';

export function setApiKey(key: string) {
  apiKey = key;
}
export function getApiKey() {
  return apiKey;
}

export function setProvider(p: string) {
  provider = p;
}
export function getProvider() {
  return provider;
}
