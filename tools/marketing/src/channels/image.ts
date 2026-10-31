import { createHash } from 'node:crypto';
import type { DraftImage } from './types.ts';

const MAX_BYTES = 5 * 1024 * 1024;
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];

/** Validates an image's trusted source, accessible description and reviewed digest. */
export function validateImage(value: unknown): asserts value is DraftImage {
  if (!value || typeof value !== 'object')
    throw new Error('A reviewed image is required.');
  const image = value as Partial<DraftImage>;
  if (
    typeof image.altText !== 'string' ||
    !image.altText.trim() ||
    [...image.altText].length > 1000 ||
    typeof image.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(image.sha256)
  )
    throw new Error('Image needs alt text and a SHA-256 digest.');
  let url: URL;
  try {
    url = new URL(image.url ?? '');
  } catch {
    throw new Error('Invalid image URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'hashbrown.dev' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/marketing\/[a-z0-9/_-]+\.(png|jpe?g)$/i.test(url.pathname)
  )
    throw new Error(
      'Image must use a static HTTPS hashbrown.dev/marketing/ PNG or JPEG URL.',
    );
}

/** Downloads only the exact reviewed bytes, with no credentials, redirects or unbounded body. */
export async function loadImage(
  image: DraftImage,
  fetcher: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: 'image/png' | 'image/jpeg' }> {
  validateImage(image);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  const timer = setTimeout(() => {
    controller.abort();
    void reader?.cancel();
  }, 10000);
  try {
    response = await fetcher(image.url, {
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok || response.redirected)
      throw new Error('Image download failed.');
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'image/png' && contentType !== 'image/jpeg')
      throw new Error('Unsupported image format.');
    const length = response.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
      throw new Error('Image exceeds 5 MiB.');
    if (!response.body) throw new Error('Image body missing.');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error('Image exceeds 5 MiB.');
      chunks.push(chunk.value);
    }
    if (controller.signal.aborted) throw new Error('Image download timed out.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (
      contentType === 'image/png'
        ? !PNG.every((value, index) => bytes[index] === value)
        : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    )
      throw new Error('Image signature does not match its format.');
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256)
      throw new Error('Image digest differs from the reviewed asset.');
    return { bytes, contentType };
  } finally {
    clearTimeout(timer);
    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    } else await response?.body?.cancel().catch(() => undefined);
  }
}
