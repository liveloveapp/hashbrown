import { inboxProviderId, type InboxReceivedEmail } from './inbox-replies.ts';

/** Metadata returned by the paginated receiving API. */
export interface InboxReceivedReference {
  id: string;
  to: string[];
  created_at: string;
}

/** Reads receiving data using a server-only key; errors never include response bodies. */
export function createInboxResendClient(
  apiKey: string,
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): {
  getReceived: (id: string) => Promise<InboxReceivedEmail>;
  getSent: (id: string) => Promise<{ message_id: string | null }>;
  listReceived: () => AsyncGenerator<InboxReceivedReference>;
} {
  if (!apiKey || /[\r\n]/.test(apiKey))
    throw new Error('Resend read key is required');
  const get = async (path: string): Promise<unknown> => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(`https://api.resend.com${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Cache-Control': 'no-store',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 429 && attempt < 3) {
        const delay = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        await wait(
          Number.isFinite(delay) && delay > 0
            ? Math.min(delay * 1000, 5000)
            : 1000 * (attempt + 1),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(`Resend read failed (${response.status})`);
      return response.json();
    }
  };
  return {
    getReceived: async (id) =>
      (await get(
        `/emails/receiving/${inboxProviderId(id)}`,
      )) as InboxReceivedEmail,
    getSent: async (id) =>
      (await get(`/emails/${inboxProviderId(id)}`)) as {
        message_id: string | null;
      },
    async *listReceived() {
      const seen = new Set<string>();
      let after: string | undefined;
      for (let page = 0; page < 10000; page++) {
        const result = (await get(
          `/emails/receiving?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        )) as { data: InboxReceivedReference[]; has_more: boolean };
        if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean')
          throw new Error('Invalid Resend pagination');
        for (const item of result.data) {
          inboxProviderId(item.id);
          if (seen.has(item.id))
            throw new Error('Repeated Resend pagination cursor');
          seen.add(item.id);
          yield item;
        }
        if (!result.has_more) return;
        if (!result.data.length)
          throw new Error('Incomplete Resend pagination');
        after = result.data[result.data.length - 1].id;
      }
      throw new Error('Resend pagination budget exceeded');
    },
  };
}
