import { http } from '../http.ts';
import { loadImage } from '../image.ts';
import type { DraftImage } from '../types.ts';
import { API_BASE, LINKEDIN_VERSION } from './api.ts';
import { type LinkedInAuth, REAUTH_HINT } from './auth.ts';

const IMAGE_URN_RE = /^urn:li:image:[A-Za-z0-9_-]+$/;
const UPLOAD_TIMEOUT_MS = 20_000;

function trustedUploadUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('LinkedIn returned no image upload URL.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LinkedIn returned an invalid image upload URL.');
  }
  const trustedHost = ['linkedin.com', 'licdn.com'].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (
    url.protocol !== 'https:' ||
    !trustedHost ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    throw new Error('LinkedIn returned an untrusted image upload URL.');
  }
  return url.href;
}

async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('LinkedIn image request timed out.'));
        }, UPLOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validates the draft image, registers it with LinkedIn and uploads its bytes.
 * Failures are definite public-post failures: no public post has been sent yet.
 * Uses write access only, without an image-status GET requiring read access.
 */
export async function uploadLinkedInImage(
  auth: LinkedInAuth,
  image: DraftImage,
): Promise<string> {
  const token = await auth.accessToken();
  const { bytes, contentType } = await loadImage(image, auth.fetch);
  const fetchImpl = auth.fetch ?? fetch;
  let initialized: unknown;
  try {
    initialized = await bounded((signal) =>
      http<unknown>({
        method: 'POST',
        url: `${API_BASE}/images?action=initializeUpload`,
        headers: {
          Authorization: `Bearer ${token}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initializeUploadRequest: { owner: auth.authorUrn },
        }),
        fetch: (url, init) =>
          fetchImpl(url, { ...init, signal, redirect: 'error' }),
        retryOn5xx: false,
      }),
    );
  } catch {
    // Provider messages can echo credentials and signed upload URLs.
    throw new Error(
      `LinkedIn image initialization failed; no post was created. Check access or ${REAUTH_HINT}.`,
    );
  }
  const value =
    initialized && typeof initialized === 'object' && 'value' in initialized
      ? initialized.value
      : undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    !('image' in value) ||
    typeof value.image !== 'string' ||
    !IMAGE_URN_RE.test(value.image)
  ) {
    throw new Error(
      'LinkedIn returned no valid image URN; no post was created.',
    );
  }
  const uploadUrl = trustedUploadUrl(
    'uploadUrl' in value ? value.uploadUrl : undefined,
  );
  try {
    await bounded(async (signal) => {
      const response = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
        body: Buffer.from(bytes),
        signal,
        redirect: 'error',
      });
      // PUT has no response payload; do not read a provider error that could
      // echo its signed URL. Cancel any response stream to release resources.
      void response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new Error('Image upload rejected.');
    });
  } catch {
    throw new Error('LinkedIn image upload failed; no post was created.');
  }
  return value.image;
}
