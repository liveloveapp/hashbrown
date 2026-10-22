const FAILURE_BODY = 'Unable to process this request.';

/**
 * Escapes a value for use inside a double- or single-quoted HTML attribute.
 *
 * @param value - The raw attribute value.
 */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"'`]/gu, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return '&#96;';
    }
  });
}

/**
 * A small, uncached HTML page for a signed founder action. `title` and
 * `message` are trusted literals; `form` must be built with
 * {@link escapeHtmlAttribute}.
 *
 * @param title - The page title and heading.
 * @param message - The paragraph under the heading.
 * @param form - Optional trusted form markup.
 */
export function htmlResponse(
  title: string,
  message: string,
  form = '',
): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`,
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  );
}

/** A generic 400 with no detail about why the request was refused. */
export function failureResponse(): Response {
  return new Response(FAILURE_BODY, {
    status: 400,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/**
 * A server fault is never reported as a recorded action. The founder gets a
 * retryable answer with no internal detail, and can submit the form again.
 */
export function retryableFailureResponse(): Response {
  return new Response(FAILURE_BODY, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '30',
    },
  });
}

/**
 * Reads the single `token` field of a founder action form post. Returns null
 * for a query string, a wrong content type, an oversize or malformed body, a
 * second field or an empty token.
 *
 * @param request - The POST request.
 * @param maximumBytes - The body cap.
 * @param readBody - The bounded body reader.
 */
export async function readActionToken(
  request: Request,
  maximumBytes: number,
  readBody: (request: Request, maximumBytes: number) => Promise<string | null>,
): Promise<string | null> {
  if ([...new URL(request.url).searchParams].length > 0) return null;
  const contentType = request.headers.get('content-type');
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/x-www-form-urlencoded'
  ) {
    return null;
  }

  let bodyText: string;
  try {
    const boundedBody = await readBody(request, maximumBytes);
    if (boundedBody === null) return null;
    bodyText = boundedBody;
  } catch {
    return null;
  }
  if (bodyText.length === 0) return null;
  const entries = [...new URLSearchParams(bodyText).entries()];
  const token = entries[0]?.[1].trim() ?? '';
  return entries.length === 1 && entries[0]?.[0] === 'token' && token.length > 0
    ? token
    : null;
}
