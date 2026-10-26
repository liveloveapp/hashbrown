import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { TransportError } from './transport-error';

/** Creates a nonretryable error for unsupported or malformed encoded audio. */
function invalidAudio(message: string): TransportError {
  return new TransportError(message, {
    code: 'INVALID_MEDIA',
    retryable: false,
  });
}

/** Creates the request cancellation error used by native Prompt API inputs. */
function abortedAudio(): TransportError {
  return new TransportError('Chrome Prompt API audio validation was aborted.', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}

/** Reads a four-character RIFF chunk identifier from a bounded byte range. */
function chunkName(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Validates bounded PCM16 little-endian WAV bytes without decoding or resampling.
 * The caller owns encoded byte and MIME limits; this checks the actual container
 * and derives duration from its PCM frame count.
 *
 * @param blob - Original encoded WAV input; never modified.
 * @param options - Maximum duration in seconds, defaulting to 30.
 * @param signal - Cancellation for byte acquisition and validation.
 * @throws TransportError for invalid media or cancellation.
 * @internal
 */
export async function validateChromePromptAudio(
  blob: Blob,
  options: { readonly maxDurationSeconds?: number },
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    throw abortedAudio();
  }
  const maxDurationSeconds = options.maxDurationSeconds ?? 30;
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    throw invalidAudio('Audio duration limit must be finite and positive.');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await raceTransportOperationWithAbort(
      () => blob.arrayBuffer(),
      signal,
      abortedAudio,
    );
  } catch {
    if (signal.aborted) {
      throw abortedAudio();
    }
    throw invalidAudio('Unable to read encoded audio bytes.');
  }
  if (signal.aborted) {
    throw abortedAudio();
  }

  const view = new DataView(buffer);
  if (
    view.byteLength < 12 ||
    chunkName(view, 0) !== 'RIFF' ||
    chunkName(view, 8) !== 'WAVE' ||
    view.getUint32(4, true) !== view.byteLength - 8
  ) {
    throw invalidAudio(
      'Audio must contain a complete little-endian RIFF/WAVE container.',
    );
  }

  let offset = 12;
  let format:
    { readonly sampleRate: number; readonly blockAlign: number } | undefined;
  let dataBytes: number | undefined;
  while (offset < view.byteLength) {
    if (view.byteLength - offset < 8) {
      throw invalidAudio('Audio contains a truncated RIFF chunk header.');
    }
    const name = chunkName(view, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    const paddedEnd = end + (size % 2);
    if (paddedEnd > view.byteLength) {
      throw invalidAudio(
        'Audio contains a truncated RIFF chunk or missing padding.',
      );
    }

    if (name === 'fmt ') {
      if (format || size < 16) {
        throw invalidAudio(
          'Audio must contain exactly one complete PCM format chunk.',
        );
      }
      const encoding = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true);
      const blockAlign = view.getUint16(start + 12, true);
      const bitsPerSample = view.getUint16(start + 14, true);
      if (
        encoding !== 1 ||
        bitsPerSample !== 16 ||
        (channels !== 1 && channels !== 2) ||
        sampleRate < 8000 ||
        sampleRate > 48000 ||
        blockAlign !== channels * 2 ||
        byteRate !== sampleRate * blockAlign
      ) {
        throw invalidAudio(
          'Audio must use PCM16, one or two channels, and an 8000–48000 Hz sample rate with consistent frame sizes.',
        );
      }
      format = { sampleRate, blockAlign };
    } else if (name === 'data') {
      if (dataBytes !== undefined) {
        throw invalidAudio('Audio must contain exactly one PCM data chunk.');
      }
      dataBytes = size;
    }
    offset = paddedEnd;
  }

  if (!format || dataBytes === undefined || dataBytes === 0) {
    throw invalidAudio(
      'Audio must contain one PCM format chunk and nonempty PCM data.',
    );
  }
  if (dataBytes % format.blockAlign !== 0) {
    throw invalidAudio('Audio PCM data must contain complete sample frames.');
  }
  const durationSeconds = dataBytes / format.blockAlign / format.sampleRate;
  if (durationSeconds > maxDurationSeconds) {
    throw invalidAudio('Audio exceeds the configured duration limit.');
  }
  if (signal.aborted) {
    throw abortedAudio();
  }
}
