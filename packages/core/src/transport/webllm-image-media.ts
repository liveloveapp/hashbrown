import type { ImagePart, Message } from '@ag-ui/core';
import type {
  WebLlmImageContent,
  WebLlmImageMediaOptions,
} from './experimental-webllm-transport';
import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { TransportError } from './transport-error';

type ImageContentPart = Exclude<WebLlmImageContent, string>[number];
type PlannedContent = readonly (ImagePart | { type: 'text'; text: string })[];

/** Validated image input plan; no resources have been acquired. @internal */
export interface WebLlmImagePlan {
  readonly contents: ReadonlyMap<Message, PlannedContent>;
  readonly options: WebLlmImageMediaOptions;
  readonly maxBytes: number;
  readonly maxPixels: number;
  readonly maxTotalBytes: number;
}

/** Fully serialized content and application resource ownership. @internal */
export interface PreparedWebLlmImages {
  readonly contents: ReadonlyMap<Message, WebLlmImageContent>;
  dispose(): Promise<void>;
}

/** Validates all user image history synchronously before acquiring resources. @internal */
export function preflightWebLlmImages(
  messages: readonly Message[],
  options: WebLlmImageMediaOptions,
): WebLlmImagePlan {
  if (
    !options.images ||
    typeof options.images !== 'object' ||
    typeof options.resolve !== 'function'
  )
    throw unsupported(
      'Images require an explicit image policy and application resolver.',
    );
  const maxBytes = limit(options.images.maxBytes, 10 * 1024 * 1024, 'maxBytes');
  const maxPixels = limit(options.images.maxPixels, 16_000_000, 'maxPixels');
  const maxImages = limit(options.images.maxImages, 8, 'maxImages');
  const maxTotalBytes = limit(
    options.maxTotalBytes,
    20 * 1024 * 1024,
    'maxTotalBytes',
  );
  const contents = new Map<Message, PlannedContent>();
  let imageCount = 0;
  for (const message of messages) {
    if (message.role === 'activity' || message.role === 'reasoning') continue;
    if (!Array.isArray(message.content)) continue;
    if (message.role !== 'user')
      throw unsupported('Only user messages support image parts.');
    if (!message.content.length)
      throw invalid('User content arrays must not be empty.');
    let seenText = false;
    const parts: (ImagePart | { type: 'text'; text: string })[] = [];
    for (const part of message.content) {
      if (part?.type === 'text') {
        if (typeof part.text !== 'string')
          throw invalid('Text parts require string text.');
        seenText = true;
        parts.push({ type: 'text', text: part.text });
      } else if (part?.type === 'image') {
        if (seenText)
          throw unsupported('WebLLM images must precede all text parts.');
        if (++imageCount > maxImages)
          throw invalid('Image history exceeds maxImages.');
        validateSource(part, maxBytes);
        parts.push({ ...part, source: { ...part.source } });
      } else {
        throw unsupported('WebLLM supports only image and text user parts.');
      }
    }
    contents.set(message, parts);
  }
  return { contents, options, maxBytes, maxPixels, maxTotalBytes };
}

/** Resolves and serializes validated images while owning late asynchronous results. @internal */
export async function prepareWebLlmImages(
  plan: WebLlmImagePlan,
  signal: AbortSignal,
): Promise<PreparedWebLlmImages> {
  const cleanups: (() => Promise<void>)[] = [];
  const contents = new Map<Message, WebLlmImageContent>();
  let closed = false;
  let disposal: Promise<void> | undefined;
  let totalBytes = 0;
  const own = (cleanup: () => void | Promise<void>) => {
    let called = false;
    const once = async () => {
      if (called) return;
      called = true;
      await cleanup();
    };
    if (closed) void once().catch(() => undefined);
    else cleanups.push(once);
  };
  const dispose = () => {
    disposal ??= (async () => {
      closed = true;
      contents.clear();
      const pending = cleanups.splice(0).reverse();
      await Promise.allSettled(pending.map((cleanup) => cleanup()));
    })();
    return disposal;
  };
  try {
    checkAbort(signal);
    for (const [message, parts] of plan.contents) {
      const output: ImageContentPart[] = [];
      const trailingText: string[] = [];
      for (const part of parts) {
        checkAbort(signal);
        if (part.type === 'text') {
          trailingText.push(part.text);
          continue;
        }
        const resource = await raceTransportOperationWithAbort(
          async () => {
            const resolved = await plan.options.resolve(part, { signal });
            if (resolved?.dispose) own(() => resolved.dispose?.());
            checkAbort(signal);
            return resolved;
          },
          signal,
          aborted,
        );
        const blob = resource?.blob;
        if (!(blob instanceof Blob))
          throw invalid('The image resolver must return an encoded Blob.');
        if (!blob.size || blob.size > plan.maxBytes)
          throw invalid('Image exceeds maxBytes or is empty.');
        totalBytes += blob.size;
        if (totalBytes > plan.maxTotalBytes)
          throw invalid('Image history exceeds maxTotalBytes.');
        const mime = canonicalMime(blob.type);
        if (!supportedMime(mime))
          throw unsupported('Unsupported resolved image MIME type.');
        if (
          part.source.mimeType &&
          canonicalMime(part.source.mimeType) !== mime
        )
          throw invalid('Resolved MIME type does not match the image source.');
        const decode = (globalThis as ImageDecoderGlobal).createImageBitmap;
        if (typeof decode !== 'function')
          throw unsupported('Image decoding is unavailable.');
        await raceTransportOperationWithAbort(
          async () => {
            let bitmap: DecodedImage;
            try {
              bitmap = await decode.call(globalThis, blob);
            } catch {
              checkAbort(signal);
              throw invalid('Could not decode the image input.');
            }
            try {
              checkAbort(signal);
              const pixels = bitmap.width * bitmap.height;
              if (
                !Number.isSafeInteger(bitmap.width) ||
                !Number.isSafeInteger(bitmap.height) ||
                bitmap.width <= 0 ||
                bitmap.height <= 0 ||
                !Number.isSafeInteger(pixels) ||
                pixels > plan.maxPixels
              )
                throw invalid(
                  'Decoded image exceeds maxPixels or has invalid dimensions.',
                );
            } finally {
              bitmap.close();
            }
          },
          signal,
          aborted,
        );
        const buffer = await raceTransportOperationWithAbort(
          () => blob.arrayBuffer(),
          signal,
          aborted,
        );
        checkAbort(signal);
        if (buffer.byteLength !== blob.size)
          throw invalid('Image bytes do not match the resolved Blob size.');
        output.push({
          type: 'image_url',
          image_url: {
            url: `data:${mime};base64,${base64(new Uint8Array(buffer))}`,
          },
        });
      }
      checkAbort(signal);
      if (!output.length) contents.set(message, trailingText.join(''));
      else {
        if (trailingText.length)
          output.push({ type: 'text', text: trailingText.join('') });
        contents.set(message, output);
      }
    }
    checkAbort(signal);
    return { contents, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Structural decoder shape keeps DOM types out of public image contracts. */
interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}
/** Browser-owned image decoding without an imported runtime. */
interface ImageDecoderGlobal {
  createImageBitmap?: (blob: Blob) => Promise<DecodedImage>;
}

/** Validates annotations without loading URLs or file handles. */
function validateSource(part: ImagePart, maxBytes: number): void {
  const source = part.source;
  if (
    !source ||
    !['data', 'url', 'file'].includes(source.type) ||
    typeof source.value !== 'string' ||
    !source.value
  )
    throw invalid('Image has an invalid source.');
  if (
    source.mimeType !== undefined &&
    (typeof source.mimeType !== 'string' ||
      !supportedMime(canonicalMime(source.mimeType)))
  )
    throw unsupported('Unsupported declared image MIME type.');
  if (source.type === 'data') {
    if (source.value.length > Math.ceil(maxBytes / 3) * 4)
      throw invalid('Inline image exceeds maxBytes.');
    try {
      const bytes = atob(source.value);
      if (
        !bytes.length ||
        bytes.length > maxBytes ||
        btoa(bytes) !== source.value
      )
        throw new Error('Noncanonical base64');
    } catch {
      throw invalid('Inline image requires canonical raw base64 bytes.');
    }
  }
}
/** Normalizes only image MIME spelling, never image bytes. */
function canonicalMime(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}
/** Restricts supported encoded image formats. */
function supportedMime(mime: string): boolean {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(mime);
}
/** Validates bounded integer application policies. */
function limit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0)
    throw invalid(`${name} must be a positive safe integer.`);
  return result;
}
/** Encodes bounded bytes without a whole-buffer argument spread. */
function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    let chunk = '';
    for (const byte of bytes.subarray(offset, offset + 8192))
      chunk += String.fromCharCode(byte);
    chunks.push(chunk);
  }
  return btoa(chunks.join(''));
}
/** Stops image acquisition and serialization after cancellation. */
function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw aborted();
}
/** Creates a non-retryable invalid image error. */
function invalid(message: string): TransportError {
  return new TransportError(message, {
    code: 'INVALID_MEDIA',
    retryable: false,
  });
}
/** Creates a non-retryable unsupported image capability error. */
function unsupported(message: string): TransportError {
  return new TransportError(message, {
    code: 'FEATURE_UNSUPPORTED',
    retryable: false,
  });
}
/** Retains the local transport's cancellation error contract. */
function aborted(): TransportError {
  return new TransportError('Prompt aborted', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}
