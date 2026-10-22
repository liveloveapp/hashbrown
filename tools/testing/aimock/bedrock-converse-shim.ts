// WORKAROUND for an aimock bug (present in @copilotkit/aimock 1.45.1 and
// 1.46.0). Delete this file, and its use in recording.ts, once aimock's
// `collapseBedrockEventStream` reads Converse events by their `:event-type`
// header.
//
// The bug: on the wire, an Amazon Bedrock ConverseStream frame names its
// event in the `:event-type` header and carries an unwrapped payload such as
// `{ "contentBlockIndex": 0, "delta": { "text": "Hi" } }`. aimock's recorder
// only reads a payload wrapped by its event type, `{ "contentBlockDelta":
// { ... } }`, so it records every real Converse stream as empty.
import * as http from 'node:http';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** One decoded AWS event-stream frame. */
export interface EventStreamFrame {
  /** String-valued headers; headers of other types are skipped. */
  readonly headers: Readonly<Record<string, string>>;
  /** The raw header block, kept so re-encoding preserves it byte for byte. */
  readonly headerBytes: Buffer;
  /** The frame payload. */
  readonly payload: Buffer;
  /** The complete encoded frame. */
  readonly bytes: Buffer;
}

const PRELUDE_LENGTH = 12;
const CHECKSUM_LENGTH = 4;
const STRING_HEADER_TYPE = 7;
/** Value sizes of the fixed-width AWS event-stream header types. */
const FIXED_HEADER_SIZES: Readonly<Record<number, number>> = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  8: 8,
  9: 16,
};

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeHeaders(bytes: Buffer): Record<string, string> {
  const headers: Record<string, string> = {};
  let offset = 0;
  while (offset < bytes.length) {
    const nameLength = bytes.readUInt8(offset);
    const name = bytes.toString('utf8', offset + 1, offset + 1 + nameLength);
    offset += 1 + nameLength;
    const type = bytes.readUInt8(offset);
    offset += 1;
    if (type === STRING_HEADER_TYPE || type === 6) {
      const valueLength = bytes.readUInt16BE(offset);
      if (type === STRING_HEADER_TYPE) {
        headers[name] = bytes.toString(
          'utf8',
          offset + 2,
          offset + 2 + valueLength,
        );
      }
      offset += 2 + valueLength;
    } else if (type in FIXED_HEADER_SIZES) {
      offset += FIXED_HEADER_SIZES[type];
    } else {
      throw new Error(`Unknown event-stream header type ${type}`);
    }
  }
  return headers;
}

function encodeFrame(headerBytes: Buffer, payload: Buffer): Buffer {
  const totalLength =
    PRELUDE_LENGTH + headerBytes.length + payload.length + CHECKSUM_LENGTH;
  const frame = Buffer.alloc(totalLength);
  frame.writeUInt32BE(totalLength, 0);
  frame.writeUInt32BE(headerBytes.length, 4);
  frame.writeUInt32BE(crc32(frame.subarray(0, 8)), 8);
  headerBytes.copy(frame, PRELUDE_LENGTH);
  payload.copy(frame, PRELUDE_LENGTH + headerBytes.length);
  frame.writeUInt32BE(
    crc32(frame.subarray(0, totalLength - CHECKSUM_LENGTH)),
    totalLength - CHECKSUM_LENGTH,
  );
  return frame;
}

/**
 * Split a buffer of AWS event-stream bytes into complete frames, verifying
 * both checksums of each.
 *
 * @param bytes - Event-stream bytes, possibly ending mid-frame.
 * @returns The complete frames and any trailing bytes of an incomplete one.
 */
export function decodeEventStreamFrames(bytes: Buffer): {
  frames: EventStreamFrame[];
  rest: Buffer;
} {
  const frames: EventStreamFrame[] = [];
  let offset = 0;
  while (bytes.length - offset >= PRELUDE_LENGTH) {
    const totalLength = bytes.readUInt32BE(offset);
    if (bytes.length - offset < totalLength) {
      break;
    }
    const frame = bytes.subarray(offset, offset + totalLength);
    const headersLength = frame.readUInt32BE(4);
    if (
      frame.readUInt32BE(8) !== crc32(frame.subarray(0, 8)) ||
      frame.readUInt32BE(totalLength - CHECKSUM_LENGTH) !==
        crc32(frame.subarray(0, totalLength - CHECKSUM_LENGTH))
    ) {
      throw new Error('Event-stream frame failed its checksum');
    }
    const headerBytes = frame.subarray(
      PRELUDE_LENGTH,
      PRELUDE_LENGTH + headersLength,
    );
    frames.push({
      headers: decodeHeaders(headerBytes),
      headerBytes,
      payload: frame.subarray(
        PRELUDE_LENGTH + headersLength,
        totalLength - CHECKSUM_LENGTH,
      ),
      bytes: frame,
    });
    offset += totalLength;
  }
  return { frames, rest: bytes.subarray(offset) };
}

function parseObject(payload: Buffer): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(payload.toString('utf8'));
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function wrapFrame(frame: EventStreamFrame): Buffer {
  const eventType = frame.headers[':event-type'];
  const payload =
    frame.headers[':message-type'] === 'event' && eventType
      ? parseObject(frame.payload)
      : undefined;
  if (!eventType || !payload || eventType in payload) {
    return frame.bytes;
  }
  // Keep the original fields so the SDK client still reads the event, and
  // add the wrapped copy aimock's recorder looks for.
  const wrapped = { ...payload, [eventType]: payload };
  return encodeFrame(
    frame.headerBytes,
    Buffer.from(JSON.stringify(wrapped), 'utf8'),
  );
}

/**
 * Rewrite complete Converse event-stream frames so each JSON event payload
 * also carries a copy of itself under its `:event-type`, the shape aimock's
 * recorder reads. Other frames (exceptions, non-JSON payloads) are unchanged.
 *
 * Workaround for an aimock recorder bug; see the note at the top of this file.
 *
 * @param bytes - Complete AWS event-stream frames.
 * @returns The re-encoded frames, with fresh lengths and checksums.
 */
export function wrapConverseEventFrames(bytes: Buffer): Buffer {
  const { frames, rest } = decodeEventStreamFrames(bytes);
  return Buffer.concat([...frames.map(wrapFrame), rest]);
}

function wrappingTransform(): Transform {
  let pending = Buffer.alloc(0);
  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        const { frames, rest } = decodeEventStreamFrames(
          Buffer.concat([pending, chunk]),
        );
        pending = Buffer.from(rest);
        callback(null, Buffer.concat(frames.map(wrapFrame)));
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      callback(null, pending);
    },
  });
}

/** Request headers the shim does not forward; Node sets them for the hop. */
const HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'keep-alive']);
/** Response headers dropped because re-framing changes the body length. */
const HOP_RESPONSE_HEADERS = new Set([
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

function forwardableHeaders(
  headers: http.IncomingHttpHeaders,
  skip: ReadonlySet<string>,
): http.OutgoingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => value !== undefined && !skip.has(name.toLowerCase()),
    ),
  );
}

/** Longest slice of an upstream error body included in a report. */
const ERROR_REPORT_LENGTH = 300;

function maskAccountIdentifiers(text: string): string {
  return text
    .replace(/arn:aws[\w-]*:[^\s"]*/g, '[arn]')
    .replace(/\b\d{12}\b/g, '[account]');
}

/**
 * Report an upstream error response without consuming it for the relay:
 * listening for `data` alongside the pipe sees the same chunks.
 */
function reportUpstreamError(
  upstreamRes: http.IncomingMessage,
  status: number,
  onUpstreamError: (report: string) => void,
): void {
  const chunks: Buffer[] = [];
  upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
  upstreamRes.on('end', () => {
    const errorType = String(
      upstreamRes.headers['x-amzn-errortype'] ?? '',
    ).split(':')[0];
    const body = Buffer.concat(chunks)
      .toString('utf8')
      .slice(0, ERROR_REPORT_LENGTH);
    onUpstreamError(
      maskAccountIdentifiers(
        `Bedrock upstream ${status} ${errorType || 'error'}: ${body}`,
      ),
    );
  });
}

/** A running {@link startBedrockConverseShim} proxy. */
export interface BedrockConverseShim {
  /** Base URL to give aimock as its `bedrock` upstream. */
  readonly url: string;
  /** Stop the proxy. */
  stop(): Promise<void>;
}

/**
 * Start a local proxy that sits between aimock's recorder and Amazon Bedrock
 * while recording. It forwards each request to `upstream` unchanged, apart
 * from the Host header, which becomes the upstream host the request was
 * signed for, so a SigV4 signature stays valid. Event-stream responses come
 * back through {@link wrapConverseEventFrames}; others are relayed as is.
 *
 * Workaround for an aimock recorder bug; see the note at the top of this file.
 * Use it in record mode only: replay never reaches it.
 *
 * aimock records a failed upstream call without the provider's error, so the
 * shim reports each error response (status, `x-amzn-errortype` and the start
 * of the body, with account ids and ARNs masked) to `onUpstreamError`, which
 * defaults to `console.warn`.
 *
 * @param options - `upstream`: the real Bedrock Runtime base URL, such as
 * `https://bedrock-runtime.us-east-1.amazonaws.com`; `onUpstreamError`:
 * receives a masked one-line report of each upstream error response.
 * @returns The proxy's URL and a stop function.
 */
export async function startBedrockConverseShim(options: {
  readonly upstream: string;
  readonly onUpstreamError?: (report: string) => void;
}): Promise<BedrockConverseShim> {
  const upstream = new URL(options.upstream);
  const onUpstreamError =
    options.onUpstreamError ?? ((report: string) => console.warn(report));
  const transport = upstream.protocol === 'https:' ? https : http;
  const server = http.createServer((req, res) => {
    const target = new URL(req.url ?? '/', upstream);
    const upstreamReq = transport.request(
      target,
      {
        method: req.method,
        headers: forwardableHeaders(req.headers, HOP_REQUEST_HEADERS),
      },
      (upstreamRes) => {
        const contentType = String(upstreamRes.headers['content-type'] ?? '');
        res.writeHead(
          upstreamRes.statusCode ?? 502,
          forwardableHeaders(upstreamRes.headers, HOP_RESPONSE_HEADERS),
        );
        const status = upstreamRes.statusCode ?? 502;
        if (status >= 400) {
          reportUpstreamError(upstreamRes, status, onUpstreamError);
        }
        const body = contentType
          .toLowerCase()
          .includes('application/vnd.amazon.eventstream')
          ? pipeline(upstreamRes, wrappingTransform(), res)
          : pipeline(upstreamRes, res);
        body.catch(() => res.destroy());
      },
    );
    upstreamReq.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ message: error.message }));
    });
    req.pipe(upstreamReq);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
