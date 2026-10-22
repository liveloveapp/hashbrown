import { pathToFileURL } from 'node:url';
import { createJsonClient } from './lib.mjs';

const DOMAIN = 'replies.hashbrown.dev';
const ADDRESS = `brian@${DOMAIN}`;

/** Returns fully qualified DNS proposals confined to the pilot; never writes DNS. */
export function pilotDnsRecords(records) {
  return records.map((record) => {
    const raw = String(record.name).replace(/\.$/, '');
    if (raw === 'hashbrown.dev' || !/^[A-Za-z0-9_@.-]+$/.test(raw))
      throw new Error('Non-pilot DNS record');
    const name =
      raw === '@' || raw === DOMAIN
        ? DOMAIN
        : raw.endsWith('.hashbrown.dev')
          ? raw
          : raw === 'replies' || raw.endsWith('.replies')
            ? `${raw}.hashbrown.dev`
            : `${raw}.${DOMAIN}`;
    if (name !== DOMAIN && !name.endsWith(`.${DOMAIN}`))
      throw new Error('Non-pilot DNS record');
    return { ...record, name };
  });
}

async function list(request, path) {
  const items = [],
    seen = new Set();
  let after;
  for (let page = 0; page < 1000; page++) {
    const result = await request(
      'GET',
      `${path}${after ? `?after=${encodeURIComponent(after)}` : ''}`,
    );
    if (!Array.isArray(result.data)) throw new Error('Invalid provider list');
    for (const item of result.data) {
      if (seen.has(item.id)) throw new Error('Repeated provider cursor');
      seen.add(item.id);
      items.push(item);
    }
    if (!result.has_more) return items;
    after = result.data.at(-1)?.id;
    if (!after) throw new Error('Incomplete provider list');
  }
  throw new Error('Provider list budget exceeded');
}

/**
 * Plans or enables only direct Receiving on the receiving subdomain. Domain DNS
 * records are returned for review; neither mode has any DNS write capability.
 */
export async function provisionInboxPilot(request, { apply = false } = {}) {
  const domains = await list(request, '/domains');
  let domain = domains.find((item) => item.name === DOMAIN);
  const actions = [];
  if (!domain) {
    actions.push('create receiving subdomain');
    if (!apply)
      return {
        state: 'planned',
        actions,
        dns: [],
      };
    domain = await request('POST', '/domains', {
      name: DOMAIN,
      region: 'us-east-1',
      capabilities: { sending: 'disabled', receiving: 'enabled' },
    });
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(domain.id))
    throw new Error('Invalid domain identifier');
  let full = await request('GET', `/domains/${domain.id}`);
  if (full.name !== DOMAIN) throw new Error('Provider domain mismatch');
  if (full.capabilities?.receiving !== 'enabled') {
    actions.push('enable subdomain receiving');
    if (apply) {
      await request('PATCH', `/domains/${domain.id}`, {
        capabilities: { receiving: 'enabled' },
        open_tracking: false,
        click_tracking: false,
      });
      full = await request('GET', `/domains/${domain.id}`);
    }
  }
  const dns = pilotDnsRecords(full.records ?? []);
  if (full.status !== 'verified')
    return { state: 'awaiting_dns', domainId: domain.id, actions, dns };
  return {
    state: full.capabilities?.receiving === 'enabled' ? 'ready' : 'planned',
    domainId: domain.id,
    address: ADDRESS,
    actions,
    dns,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const token =
    process.env.RESEND_PROVISION_API_KEY ||
    process.env.RESEND_PROVISIONING_API_KEY;
  if (!token || process.argv.slice(2).some((arg) => arg !== '--apply')) {
    process.stderr.write(
      'Set RESEND_PROVISION_API_KEY (or RESEND_PROVISIONING_API_KEY). Default is read-only; use --apply to create pilot resources.\n',
    );
    process.exitCode = 1;
  } else {
    provisionInboxPilot(
      createJsonClient({ baseUrl: 'https://api.resend.com', token }),
      { apply: process.argv.includes('--apply') },
    )
      .then((result) =>
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
      )
      .catch(() => {
        process.stderr.write(
          'Pilot setup failed; inspect domain verification and permissions.\n',
        );
        process.exitCode = 1;
      });
  }
}
