#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { createChecklist, createJsonClient } from './lib.mjs';

const POSTHOG_BASE_URL = 'https://us.posthog.com';
const POSTHOG_INGEST_HOST = 'https://us.i.posthog.com';
const PROJECT_NAME = 'hashbrown';

/**
 * Finds the PostHog project with this exact name under the current
 * organization, creating it when absent. The project token is a secret
 * callers must not log.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} posthog JSON client for the PostHog API.
 * @param {string} name Project name.
 * @returns {Promise<{ status: 'created' | 'exists', project: { id: number | string, api_token: string } }>}
 */
export async function ensurePosthogProject(posthog, name) {
  const org = await posthog('GET', '/api/organizations/@current/');
  const base = `/api/organizations/${org.id}/projects/`;
  const { results } = await posthog('GET', base);
  const match = (results ?? []).find((p) => p.name === name);
  if (match) {
    return {
      status: 'exists',
      project: { id: match.id, api_token: match.api_token },
    };
  }

  const created = await posthog('POST', base, { name });
  return {
    status: 'created',
    project: { id: created.id, api_token: created.api_token },
  };
}

/**
 * Provisions the growth PostHog project. Records the step on the checklist
 * (never the token) and returns the env values the Vercel project expects.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} posthog JSON client for the PostHog API.
 * @param {{ add: (step: string, outcome: string, detail?: string) => void }} checklist Step recorder.
 * @returns {Promise<{ NEXT_PUBLIC_POSTHOG_TOKEN: string, NEXT_PUBLIC_POSTHOG_HOST: string, POSTHOG_PROJECT_ID: string }>}
 */
export async function provisionPosthog(posthog, checklist) {
  const { status, project } = await ensurePosthogProject(posthog, PROJECT_NAME);
  checklist.add(`PostHog project ${PROJECT_NAME}`, status);

  return {
    NEXT_PUBLIC_POSTHOG_TOKEN: project.api_token,
    NEXT_PUBLIC_POSTHOG_HOST: POSTHOG_INGEST_HOST,
    POSTHOG_PROJECT_ID: String(project.id),
  };
}

async function main() {
  const token = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!token) throw new Error('POSTHOG_PERSONAL_API_KEY is required');
  const posthog = createJsonClient({ baseUrl: POSTHOG_BASE_URL, token });
  const checklist = createChecklist();
  await provisionPosthog(posthog, checklist);
  checklist.print();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
