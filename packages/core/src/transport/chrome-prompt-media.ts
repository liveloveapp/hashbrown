import type { AudioPart, ImagePart, Message } from '@ag-ui/core';
import { TransportError } from './transport-error';
import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { validateChromePromptAudio } from './chrome-prompt-audio';
import type { SupportedOutputLanguage } from './experimental-chrome-local-transport';

/**
 * Structural ownership surface of a decoded native image, without DOM library types.
 * @alpha
 */
export interface ChromePromptImageBitmap {
  /** Decoded width in pixels. */
  readonly width: number;
  /** Decoded height in pixels. */
  readonly height: number;
  /** Releases the image owned by this run. */
  close(): void;
}

/** Internal native image decoder surface available only in supported browsers. */
interface ChromePromptImageDecoderGlobal {
  createImageBitmap?: (blob: Blob) => Promise<ChromePromptImageBitmap>;
}

/** A native text or explicitly enabled media prompt part. @alpha */
export type ChromePromptContent =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'image'; readonly value: ChromePromptImageBitmap }
  | { readonly type: 'audio'; readonly value: Blob };

/** An application-resolved encoded resource and its optional owned-resource cleanup. @alpha */
export interface ChromePromptMediaResource {
  readonly blob: Blob;
  readonly dispose?: () => void | Promise<void>;
}

/** Resolves a source under application policy without implicit transport network access. @alpha */
export type ChromePromptMediaResolver = (
  part: ImagePart | AudioPart,
  context: { readonly signal: AbortSignal },
) => ChromePromptMediaResource | Promise<ChromePromptMediaResource>;

/** Bounds decoded image input. PNG, JPEG and WebP are supported. @alpha */
export interface ChromePromptImagePolicy {
  /** Maximum encoded bytes per image; defaults to 10 MiB. */
  readonly maxBytes?: number;
  /** Maximum decoded pixels per image; defaults to 16 million. */
  readonly maxPixels?: number;
}

/** Bounds encoded PCM WAV input without changing its sample rate. @alpha */
export interface ChromePromptAudioPolicy {
  /** Maximum encoded bytes per audio part; defaults to 10 MiB. */
  readonly maxBytes?: number;
  /** Maximum duration per audio part; defaults to 30 seconds. */
  readonly maxDurationSeconds?: number;
}

/** Explicit media opt-ins and application resolution for the Chrome transport. @alpha */
export interface ChromePromptMediaOptions {
  readonly resolve: ChromePromptMediaResolver;
  /** Declared text/audio input languages, independent of output; defaults to English. */
  readonly inputLanguages?: readonly SupportedOutputLanguage[];
  readonly images?: ChromePromptImagePolicy;
  readonly audio?: ChromePromptAudioPolicy;
  /** Maximum encoded bytes across a run's media history; defaults to 20 MiB. */
  readonly maxTotalBytes?: number;
}

/** Prepared native content and ownership for a single run. @internal */
export interface PreparedChromePromptMedia {
  readonly contents: ReadonlyMap<Message, readonly ChromePromptContent[]>;
  readonly inputTypes: readonly ('text' | 'image' | 'audio')[];
  dispose(): Promise<void>;
}

/** Resolves explicitly enabled user media before native session creation. @internal */
export async function prepareChromePromptMedia(
  messages: readonly Message[],
  options: ChromePromptMediaOptions,
  signal: AbortSignal,
): Promise<PreparedChromePromptMedia> {
  if (
    (!options.images && !options.audio) ||
    typeof options.resolve !== 'function'
  ) {
    throw unsupported(
      'Media requires an explicit image or audio policy and an application resolver.',
    );
  }
  const inputLanguages = options.inputLanguages ?? ['en'];
  if (
    !Array.isArray(inputLanguages) ||
    inputLanguages.length === 0 ||
    inputLanguages.some(
      (language) => !['en', 'es', 'ja', 'de', 'fr'].includes(language),
    )
  ) {
    throw unsupported(
      'Media inputLanguages must name supported text input languages.',
    );
  }
  const maxTotalBytes = limit(
    options.maxTotalBytes,
    20 * 1024 * 1024,
    'maxTotalBytes',
  );
  const cleanups: (() => Promise<void>)[] = [];
  let closed = false;
  let disposal: Promise<void> | undefined;
  let totalBytes = 0;
  const contents = new Map<Message, readonly ChromePromptContent[]>();
  const kinds = new Set<'text' | 'image' | 'audio'>(['text']);

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
      const results = await Promise.allSettled(
        [...cleanups].reverse().map((cleanup) => cleanup()),
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    })();
    return disposal;
  };

  try {
    checkAbort(signal);
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      if (message.role !== 'user')
        throw unsupported('Only user messages may contain native media parts.');
      const parts: ChromePromptContent[] = [];
      for (const part of message.content) {
        checkAbort(signal);
        if (part.type === 'text') {
          parts.push({ type: 'text', value: part.text });
          continue;
        }
        if (part.type !== 'image' && part.type !== 'audio') {
          throw unsupported(
            `Chrome media input does not support ${part.type} parts.`,
          );
        }
        const policy = part.type === 'image' ? options.images : options.audio;
        if (!policy)
          throw unsupported(
            `Chrome ${part.type} input requires an explicit opt-in.`,
          );
        const maxBytes = limit(policy.maxBytes, 10 * 1024 * 1024, 'maxBytes');
        validateSource(part, maxBytes);
        const resource = await raceTransportOperationWithAbort(
          async () => {
            const resolved = await options.resolve(part, { signal });
            if (resolved?.dispose) own(() => resolved.dispose?.());
            checkAbort(signal);
            return resolved;
          },
          signal,
          aborted,
        );
        const blob = resource?.blob;
        if (!(blob instanceof Blob))
          throw invalid('The media resolver must return an encoded Blob.');
        if (blob.size === 0 || blob.size > maxBytes)
          throw invalid('Media exceeds its encoded byte limit or is empty.');
        totalBytes += blob.size;
        if (totalBytes > maxTotalBytes)
          throw invalid('Media history exceeds maxTotalBytes.');
        const mime = canonicalMime(blob.type);
        if (!supportedMime(part.type, mime))
          throw unsupported(`Unsupported ${part.type} MIME type: ${blob.type}`);
        const sourceMime = part.source.mimeType;
        if (sourceMime && canonicalMime(sourceMime) !== mime)
          throw invalid(
            'Resolved MIME type does not match the declared media source.',
          );
        if (part.type === 'image') {
          const decode = (globalThis as ChromePromptImageDecoderGlobal)
            .createImageBitmap;
          if (typeof decode !== 'function')
            throw unsupported('Native image decoding is unavailable.');
          const bitmap = await raceTransportOperationWithAbort(
            async () => {
              let decoded: ChromePromptImageBitmap;
              try {
                decoded = await decode.call(globalThis, blob);
              } catch {
                checkAbort(signal);
                throw invalid('Chrome could not decode the image input.');
              }
              own(() => decoded.close());
              checkAbort(signal);
              return decoded;
            },
            signal,
            aborted,
          );
          const pixels = bitmap.width * bitmap.height;
          const maxPixels = limit(
            options.images?.maxPixels,
            16_000_000,
            'maxPixels',
          );
          if (
            !Number.isSafeInteger(pixels) ||
            bitmap.width <= 0 ||
            bitmap.height <= 0 ||
            pixels > maxPixels
          ) {
            throw invalid(
              'Decoded image exceeds maxPixels or has invalid dimensions.',
            );
          }
          parts.push({ type: 'image', value: bitmap });
        } else {
          await validateChromePromptAudio(blob, options.audio ?? {}, signal);
          parts.push({ type: 'audio', value: blob });
        }
        kinds.add(part.type);
      }
      contents.set(message, parts);
    }
    checkAbort(signal);
    return {
      contents,
      inputTypes: (['text', 'image', 'audio'] as const).filter((type) =>
        kinds.has(type),
      ),
      dispose,
    };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  }
}

/** Validates source annotations without resolving URLs or provider file handles. */
function validateSource(part: ImagePart | AudioPart, maxBytes: number): void {
  const source = part.source;
  if (
    !source ||
    !['data', 'url', 'file'].includes(source.type) ||
    typeof source.value !== 'string' ||
    !source.value
  ) {
    throw invalid('Media has an invalid source.');
  }
  if (
    source.mimeType &&
    !supportedMime(part.type, canonicalMime(source.mimeType))
  ) {
    throw unsupported(
      `Unsupported declared ${part.type} MIME type: ${source.mimeType}`,
    );
  }
  if (source.type === 'data') {
    if (source.value.length > Math.ceil(maxBytes / 3) * 4)
      throw invalid('Inline media exceeds its encoded byte limit.');
    try {
      const decoded = atob(source.value);
      if (
        !decoded.length ||
        decoded.length > maxBytes ||
        btoa(decoded) !== source.value
      )
        throw new Error('Noncanonical base64');
    } catch {
      throw invalid(
        'Inline media requires canonical base64 bytes, not a data URI.',
      );
    }
  }
}

/** Normalizes only MIME spelling; it never changes media bytes. */
function canonicalMime(value: string): string {
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  return mime === 'audio/x-wav' || mime === 'audio/wave' ? 'audio/wav' : mime;
}

/** Restricts formats to the codecs covered by native adapter validation. */
function supportedMime(type: 'image' | 'audio', mime: string): boolean {
  return type === 'image'
    ? ['image/png', 'image/jpeg', 'image/webp'].includes(mime)
    : mime === 'audio/wav';
}

/** Requires finite positive application policy limits. */
function limit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0)
    throw invalid(`${name} must be a finite positive number.`);
  return resolved;
}

/** Stops resource acquisition after cancellation. */
function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw aborted();
}

/** Creates a non-retryable input validation error. */
function invalid(message: string): TransportError {
  return new TransportError(message, {
    retryable: false,
    code: 'INVALID_MEDIA',
  });
}

/** Creates an explicit unsupported-capability error. */
function unsupported(message: string): TransportError {
  return new TransportError(message, {
    retryable: false,
    code: 'FEATURE_UNSUPPORTED',
  });
}

/** Creates the existing native cancellation error. */
function aborted(): TransportError {
  return new TransportError('Prompt aborted', {
    retryable: false,
    code: 'PROMPT_API_ABORTED',
  });
}
