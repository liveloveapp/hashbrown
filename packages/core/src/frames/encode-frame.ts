import { Frame } from './frame-types';

/**
 * Encodes a frame into a binary format.
 *
 * @public
 * @param frame - The frame to encode.
 * @returns The encoded frame.
 */
export function encodeFrame(frame: Frame): Uint8Array {
  console.log(JSON.stringify(frame));
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(frame));
  const len = jsonBytes.length;
  const out = new Uint8Array(4 + len);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  view.setUint32(0, len, /* Big Endian */ false);
  out.set(jsonBytes, 4);

  return out;
}
