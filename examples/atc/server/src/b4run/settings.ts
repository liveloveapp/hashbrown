import { randomBytes } from 'node:crypto';

/** Reads only optional-agent settings; the OpenAI backend never calls this. */
export function readAgentBackendSettings(env: NodeJS.ProcessEnv): {
  readonly cookieSecret: string;
  readonly secure: boolean;
} {
  const hosted = env['VERCEL'] === '1';
  const secret = env['ATC_B4RUN_COOKIE_SECRET'];
  if (hosted && !secret)
    throw new Error(
      'ATC_B4RUN_COOKIE_SECRET is required for hosted b4.run chat',
    );
  if (hosted && !env['ATC_B4RUN_DATABASE_URL'])
    throw new Error(
      'ATC_B4RUN_DATABASE_URL is required for hosted b4.run chat',
    );
  return {
    cookieSecret: secret ?? randomBytes(32).toString('hex'),
    secure: hosted || env['NODE_ENV'] === 'production',
  };
}
