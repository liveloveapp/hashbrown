'use client';

import { useCallback, useRef, useState } from 'react';
import { track } from '../../lib/analytics/client';
import { analyticsEvents } from '../../lib/analytics/events';

/** Where the Get unstuck form posts. */
const ROUTE = '/_/forms/unstuck';

/** The facts a visitor sends. Callers pass them already trimmed. */
export interface UnstuckFacts {
  readonly email: string;
  readonly message: string;
  /** The honeypot; a real visitor leaves it empty. */
  readonly website_url: string;
}

/** Where the form is in its flow. */
export type UnstuckFormStatus = 'idle' | 'pending' | 'sent' | 'failed';

/** What {@link useUnstuckForm} returns. */
export interface UnstuckFormController {
  status: UnstuckFormStatus;
  /** Posts the facts. Resolves once the status has settled; never throws. */
  submit: (facts: UnstuckFacts) => Promise<void>;
  /** Back to idle; keeps the submission id so a byte-identical retry reuses it. */
  reset: () => void;
}

/**
 * The Get unstuck submit flow: one request at a time, one `submission_id` per
 * distinct set of facts (reused only for byte-identical retries, so a retry
 * the server has already seen replays instead of conflicting), and the three
 * analytics events. Any non-OK answer, a 409 included, is a failure. Events
 * carry the surface and an error reason, never the email or message.
 *
 * @returns The current status, `submit` and `reset`.
 */
export function useUnstuckForm(): UnstuckFormController {
  const [status, setStatus] = useState<UnstuckFormStatus>('idle');
  const attempt = useRef<{ fingerprint: string; submissionId: string } | null>(
    null,
  );
  const inFlight = useRef(false);

  const submit = useCallback(async (facts: UnstuckFacts) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const surface = { surface: 'unstuck' } as const;
    try {
      setStatus('pending');
      track(analyticsEvents.marketingUnstuckFormSubmit, surface);
      const fingerprint = JSON.stringify(facts);
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = {
          fingerprint,
          submissionId: globalThis.crypto.randomUUID(),
        };
      }
      const fail = (error_reason: string) => {
        track(analyticsEvents.marketingUnstuckFormFail, {
          ...surface,
          error_reason,
        });
        setStatus('failed');
      };
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submission_id: attempt.current.submissionId,
            ...facts,
          }),
        });
        if (response.ok) {
          attempt.current = null;
          track(analyticsEvents.marketingUnstuckFormSuccess, surface);
          setStatus('sent');
        } else if (response.status === 429) {
          fail('rate_limited');
        } else {
          fail('api_error');
        }
      } catch {
        fail('network_error');
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setStatus('idle'), []);

  return { status, submit, reset };
}
