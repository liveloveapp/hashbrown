#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import {
  createVercelClient,
  DOMAIN,
  ensureDnsRecords,
} from '../../../vercel/bootstrap.mjs';
import { createChecklist, createJsonClient } from './lib.mjs';

const RESEND_BASE_URL = 'https://api.resend.com';
const REGION = 'us-east-1';
const KEY_NAME = 'hashbrown-lifecycle';
const DNS_TTL = 3600;
const WEBHOOK_STEP =
  'create a webhook at https://resend.com/webhooks for https://hashbrown.dev/_/webhooks/resend (events email.sent, delivered, delivery_delayed, bounced, complained, suppressed, failed) and set RESEND_WEBHOOK_SECRET on hashbrown-www and hashbrown-lifecycle';

/**
 * Finds the Resend domain with this exact name, creating it in us-east-1 when
 * absent, then reads it back for its DNS records.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} resend JSON client for the Resend API.
 * @param {string} name Domain name.
 * @returns {Promise<{ status: 'created' | 'exists', domain: { id: string, status: string, records: object[] } }>}
 */
export async function ensureResendDomain(resend, name) {
  const { data } = await resend('GET', '/domains');
  const match = (data ?? []).find((d) => d.name === name);
  const status = match ? 'exists' : 'created';
  const id = match
    ? match.id
    : (await resend('POST', '/domains', { name, region: REGION })).id;

  const full = await resend('GET', `/domains/${id}`);
  return {
    status,
    domain: { id, status: full.status, records: full.records ?? [] },
  };
}

/**
 * Converts Resend DNS records to the shape `ensureDnsRecords` expects. Resend
 * names are relative to the zone and used as-is; `priority` becomes
 * `mxPriority` and the `Auto` ttl becomes 3600.
 *
 * @param {Array<{ name: string, type: string, value: string, ttl?: string | number, priority?: number }>} records Records from the Resend API.
 * @returns {Array<{ name: string, type: string, value: string, ttl: number, mxPriority?: number }>}
 */
export function toVercelDnsRecords(records) {
  return records.map(({ name, type, value, priority }) => ({
    name,
    type,
    value,
    ttl: DNS_TTL,
    ...(priority === undefined ? {} : { mxPriority: priority }),
  }));
}

/**
 * Ensures a sending-only API key with this exact name exists for the domain.
 * The token exists only in the creation response, so it is returned only for
 * `created`; callers must not log it.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} resend JSON client for the Resend API.
 * @param {string} name Key name.
 * @param {string} domainId Domain the key may send from.
 * @returns {Promise<{ status: 'created', token: string } | { status: 'exists' }>}
 */
export async function ensureSendingKey(resend, name, domainId) {
  const { data } = await resend('GET', '/api-keys');
  if ((data ?? []).some((k) => k.name === name)) return { status: 'exists' };

  const created = await resend('POST', '/api-keys', {
    name,
    permission: 'sending_access',
    domain_id: domainId,
  });
  return { status: 'created', token: created.token };
}

/**
 * Asks Resend to re-check the domain's DNS and reads the resulting status.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} resend JSON client for the Resend API.
 * @param {string} domainId Domain id.
 * @returns {Promise<string>} The domain status after the check.
 */
export async function verifyDomain(resend, domainId) {
  await resend('POST', `/domains/${domainId}/verify`);
  const { status } = await resend('GET', `/domains/${domainId}`);
  return status;
}

/**
 * Provisions the Resend domain, its Vercel DNS records, and the sending key.
 * The verify request is sent only when the domain is not yet verified, so a
 * rerun on a provisioned account makes no writes.
 * Records steps on the checklist (never a token) and returns the env values
 * for the Vercel project; `RESEND_API_KEY` is absent when the key already
 * existed, since Resend shows a token only once.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} resend JSON client for the Resend API.
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} vercel Vercel client from `createVercelClient`.
 * @param {{ add: (step: string, outcome: string, detail?: string) => void }} checklist Step recorder.
 * @returns {Promise<{ RESEND_API_KEY?: string }>}
 */
export async function provisionResend(resend, vercel, checklist) {
  const { status, domain } = await ensureResendDomain(resend, DOMAIN);
  checklist.add(`Resend domain ${DOMAIN}`, status);

  const dns = await ensureDnsRecords(
    vercel,
    DOMAIN,
    toVercelDnsRecords(domain.records),
  );
  checklist.add(
    'Resend DNS records on Vercel',
    dns.created > 0 ? 'created' : 'exists',
    `${dns.created} created, ${dns.existing} existing`,
  );

  if (domain.status === 'verified') {
    checklist.add('Resend domain verification', 'exists', 'verified');
  } else {
    const verified = await verifyDomain(resend, domain.id);
    checklist.add(
      'Resend domain verification',
      verified === domain.status ? 'exists' : 'updated',
      `status: ${verified}`,
    );
  }

  const key = await ensureSendingKey(resend, KEY_NAME, domain.id);
  checklist.add(`Resend sending key ${KEY_NAME}`, key.status);

  checklist.add('Resend webhook', 'manual', WEBHOOK_STEP);

  return key.status === 'created' ? { RESEND_API_KEY: key.token } : {};
}

async function main() {
  const token = process.env.RESEND_PROVISION_API_KEY;
  if (!token) throw new Error('RESEND_PROVISION_API_KEY is required');
  const vercelToken = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!vercelToken) throw new Error('VERCEL_TOKEN is required');

  const { user } = await createVercelClient(vercelToken)('GET', '/v2/user');
  const teamId = user.defaultTeamId ?? undefined;
  const vercel = createVercelClient(vercelToken, fetch, { teamId });
  const resend = createJsonClient({ baseUrl: RESEND_BASE_URL, token });
  const checklist = createChecklist();
  await provisionResend(resend, vercel, checklist);
  checklist.print();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
