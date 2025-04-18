export enum Params {
  NODE_ENV = 'NODE_ENV',
  OPENAI_API_KEY = 'OPENAI_API_KEY',
}

export function getParam(paramName: Params): string {
  const value = process.env[paramName];

  if (!value || typeof value !== 'string') {
    throw new Error(`No value set for environment parameter ${paramName}`);
  }

  return value;
}
