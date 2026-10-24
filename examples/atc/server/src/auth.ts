import { defineAuth } from '@b4run/sdk';

/** Identity is injected by the private adapter after it verifies the visitor cookie. */
export default defineAuth({
  authenticate: (request) => {
    const id = request.headers['x-atc-visitor'];
    return id ? { id } : undefined;
  },
});
