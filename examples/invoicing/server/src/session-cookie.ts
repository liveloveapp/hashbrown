const cookieName = 'invoicing_session';

/**
 * Read one unambiguous opaque session identity from the local cookie.
 *
 * Two cookies of the same name is not a session this server can identify, so
 * it is treated as no session rather than picking one.
 */
export function readSessionCookie(
  cookie: string | undefined,
): string | undefined {
  const matches = (cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(cookieName.length + 1);
  return /^[0-9a-f-]{36}$/.test(value) ? value : undefined;
}

/** The Set-Cookie value that binds a browser to a session. */
export function sessionCookie(sessionId: string, secure: boolean): string {
  return `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}
