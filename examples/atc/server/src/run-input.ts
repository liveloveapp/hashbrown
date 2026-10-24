import type { RunAgentInput } from '@ag-ui/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BodyTooLargeError, readJsonBody, sendJson } from './http';
import { isRunInput, isTooLarge } from './run-policy';

/**
 * The run input of a POST body, with the run limits applied, or null once a
 * 400 or 413 has been sent.
 */
export async function readRunInput(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<RunAgentInput | null> {
  let input: unknown;
  try {
    input = await readJsonBody(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      // The rest of the body was never read, so this connection cannot carry
      // another request.
      sendJson(
        res,
        413,
        { error: 'Request too large' },
        { Connection: 'close' },
      );
    } else {
      sendJson(res, 400, { error: 'Invalid JSON' });
    }

    return null;
  }
  if (!isRunInput(input)) {
    sendJson(res, 400, { error: 'Invalid run input' });

    return null;
  }
  if (isTooLarge(input)) {
    sendJson(res, 413, { error: 'Request too large' });

    return null;
  }

  return input;
}
