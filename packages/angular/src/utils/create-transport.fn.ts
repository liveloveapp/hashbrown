import {
  Chat,
  createHttpTransport,
  type TransportOrFactory,
} from '@hashbrownai/core';

interface CreateTransportOptions {
  transport?: TransportOrFactory;
  readBaseUrl: () => string | undefined;
  createMiddleware: () => Chat.Middleware[] | undefined;
}

/**
 * Resolves an explicit Angular transport or lazily creates the configured
 * default HTTP transport.
 */
export function createTransport({
  transport,
  readBaseUrl,
  createMiddleware,
}: CreateTransportOptions): TransportOrFactory {
  if (transport) {
    return transport;
  }

  const baseUrl = readBaseUrl();
  const middleware = createMiddleware();

  return () => createHttpTransport({ baseUrl, middleware });
}
