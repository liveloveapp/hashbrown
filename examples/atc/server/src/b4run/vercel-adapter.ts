import { readChatBackend } from '../chat-backend';
import { readAgentBackendSettings } from './settings';
import { createAgentFetchHandler } from './fetch-handler';
import { createVisitorIdentity } from './visitor';

/** The public fetch surface emitted by b4.run's Vercel build target. */
export interface GeneratedAgentApp {
  fetch(
    request: Request,
    env: Record<string, string>,
  ): Response | Promise<Response>;
}

/**
 * Wraps generated b4.run output with the same ATC request policy as local Node.
 * Only /api/run reaches the private app; hosted state never falls back to the
 * general DATABASE_URL or ephemeral files.
 */
export function createAtcVercelAdapter(
  app: GeneratedAgentApp,
  readEnv: () => NodeJS.ProcessEnv = () => process.env,
) {
  return {
    async fetch(request: Request): Promise<Response> {
      if (new URL(request.url).pathname !== '/api/run')
        return Response.json({ error: 'Not found' }, { status: 404 });
      const env = readEnv();
      let settings;
      try {
        if (readChatBackend(env['ATC_CHAT_BACKEND']) !== 'b4run')
          throw new Error('Backend does not match this artifact');
        settings = readAgentBackendSettings({ ...env, VERCEL: '1' });
        const visitors = createVisitorIdentity({
          key: settings.cookieSecret,
          secure: true,
        });
        const runtimeEnv = {
          DATABASE_URL: env['ATC_B4RUN_DATABASE_URL'] as string,
          B4_PG_TABLE_PREFIX: 'atc',
        };
        const guarded = createAgentFetchHandler({
          visitors,
          runtime: { fetch: async (inner) => app.fetch(inner, runtimeEnv) },
        });
        return await guarded.fetch(request);
      } catch {
        return Response.json(
          { error: 'Agent backend configuration unavailable' },
          { status: 503, headers: { 'cache-control': 'no-store' } },
        );
      }
    },
  };
}
