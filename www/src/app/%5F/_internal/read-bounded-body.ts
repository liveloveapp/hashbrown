/**
 * Reads a request body as UTF-8 text, refusing anything over a byte cap.
 *
 * @param request - The request whose body is read.
 * @param maximumBytes - The largest body accepted.
 * @returns The text, or `null` when over the cap, malformed, or not valid UTF-8.
 */
export async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<string | null> {
  const rejectUnreadBody = async (): Promise<null> => {
    if (request.body !== null && !request.body.locked) {
      await request.body.cancel().catch(() => undefined);
    }
    return null;
  };

  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    return rejectUnreadBody();
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^\d+$/u.test(normalizedLength)) return rejectUnreadBody();
    const byteLength = Number(normalizedLength);
    if (!Number.isSafeInteger(byteLength) || byteLength > maximumBytes) {
      return rejectUnreadBody();
    }
  }

  if (request.body === null) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decoded: string[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      decoded.push(decoder.decode(value, { stream: true }));
    }
    decoded.push(decoder.decode());
    return decoded.join('');
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
