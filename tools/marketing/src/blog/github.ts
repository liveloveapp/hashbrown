import { http } from '../channels/http.ts';

const API = 'https://api.github.com';
const OWNER = 'liveloveapp';
const REPO = 'hashbrown';
const REPO_URL = `${API}/repos/${OWNER}/${REPO}`;

/** The GitHub calls the blog publisher needs on the hashbrown repo. */
export interface GitHubClient {
  /** Merges `main` into the PR branch. Already up to date is success. */
  updateBranch(prNumber: number): Promise<void>;
  pullState(prNumber: number): Promise<{
    merged: boolean;
    mergeable: boolean | null;
    mergeableState: string;
  }>;
  /** Squash-merges the PR. Never retried. */
  merge(prNumber: number): Promise<void>;
  readFile(path: string, ref: 'main'): Promise<string>;
}

interface PullResponse {
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
}

/**
 * A GitHub REST client for `liveloveapp/hashbrown`, authenticated with the
 * marketing token. The token is only ever sent as a header; errors carry the
 * status and response body, never the request.
 */
export function createGitHubClient(
  token: string,
  fetchImpl?: typeof fetch,
): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'hashbrown-marketing',
  };

  return {
    async updateBranch(prNumber) {
      try {
        await http({
          method: 'PUT',
          url: `${REPO_URL}/pulls/${prNumber}/update-branch`,
          headers,
          fetch: fetchImpl,
          retryOn5xx: false,
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith('HTTP 422') && /up to date/i.test(message)) {
          return;
        }
        throw err;
      }
    },

    async pullState(prNumber) {
      const pull = await http<PullResponse>({
        method: 'GET',
        url: `${REPO_URL}/pulls/${prNumber}`,
        headers,
        fetch: fetchImpl,
      });
      return {
        merged: pull.merged,
        mergeable: pull.mergeable,
        mergeableState: pull.mergeable_state,
      };
    },

    async merge(prNumber) {
      await http({
        method: 'PUT',
        url: `${REPO_URL}/pulls/${prNumber}/merge`,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_method: 'squash' }),
        fetch: fetchImpl,
        retryOn5xx: false,
      });
    },

    async readFile(path, ref) {
      const file = await http<{ content: string }>({
        method: 'GET',
        url: `${REPO_URL}/contents/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}?ref=${ref}`,
        headers,
        fetch: fetchImpl,
      });
      return Buffer.from(file.content, 'base64').toString('utf8');
    },
  };
}
