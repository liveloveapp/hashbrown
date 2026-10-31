import { randomUUID } from 'node:crypto';

import type { CredentialStore } from '../credentials/store.ts';
import { postDevTo } from './devto/post.ts';
import { LinkedInAuth } from './linkedin/auth.ts';
import { postLinkedIn } from './linkedin/post.ts';
import type {
  ChannelAdapter,
  Draft,
  PostResult,
  SocialChannel,
} from './types.ts';
import { validateDraft } from './validation.ts';
import { validateImage } from './image.ts';
import { XAuth } from './x/auth.ts';
import { postX } from './x/post.ts';

/** Options for {@link createAdapters}. */
export interface AdapterOptions {
  credentials: CredentialStore;
  /** Static config: client ids and secrets, the author URN and the dev.to key. */
  env: Readonly<Record<string, string | undefined>>;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Validate, then return a fake result without credentials or network. */
  dryRun: boolean;
}

function requireEnv(
  env: AdapterOptions['env'],
  channel: string,
  names: string[],
): string[] {
  const values = names.map((name) => env[name] ?? '');
  const missing = names.filter((_, index) => !values[index]);
  if (missing.length > 0) {
    throw new Error(
      `${channel} adapter missing env vars: ${missing.join(', ')}`,
    );
  }
  return values;
}

function dryRunResult(draft: Draft): PostResult {
  const postId = `dry-run-${randomUUID()}`;
  return {
    channel: draft.channel,
    postId,
    url: `dry-run://${draft.channel}/${postId}`,
    postedAt: new Date().toISOString(),
  };
}

/**
 * Creates the adapter for each channel. Every adapter validates the draft
 * first; a dry run stops there. Env config and stored credentials are read
 * when a live post needs them, so a missing one fails that post, naming the
 * variable or the auth CLI to run.
 */
export function createAdapters(
  options: AdapterOptions,
): Record<SocialChannel, ChannelAdapter> {
  const { credentials, env, dryRun } = options;
  let xAuth: XAuth | undefined;
  let linkedInAuth: LinkedInAuth | undefined;

  function adapter(
    id: SocialChannel,
    publish: (draft: Draft) => Promise<PostResult>,
  ): ChannelAdapter {
    return {
      id,
      async post(draft) {
        validateDraft(draft, { adapterId: id });
        if (id === 'x' || id === 'linkedin') validateImage(draft.image);
        return dryRun ? dryRunResult(draft) : publish(draft);
      },
    };
  }

  return {
    x: adapter('x', (draft) => {
      if (!xAuth) {
        const [clientId, clientSecret] = requireEnv(env, 'X', [
          'X_CLIENT_ID',
          'X_CLIENT_SECRET',
        ]);
        xAuth = new XAuth({
          credentials,
          clientId,
          clientSecret,
          fetch: options.fetch,
        });
      }
      return postX(xAuth, draft);
    }),
    linkedin: adapter('linkedin', (draft) => {
      if (!linkedInAuth) {
        const [authorUrn] = requireEnv(env, 'LinkedIn', [
          'LINKEDIN_AUTHOR_URN',
        ]);
        linkedInAuth = new LinkedInAuth({
          credentials,
          authorUrn,
          fetch: options.fetch,
        });
      }
      return postLinkedIn(linkedInAuth, draft);
    }),
    devto: adapter('devto', async (draft) => {
      const [apiKey] = requireEnv(env, 'Dev.to', ['DEVTO_API_KEY']);
      return postDevTo(apiKey, draft, options.fetch);
    }),
  };
}
