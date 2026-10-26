// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import posthog from 'posthog-js';
import { expect, test, vi } from 'vitest';
import { UnstuckForm } from '../../src/components/unstuck/UnstuckForm';
import { UNSTUCK_FALLBACK_ADDRESS } from '../../src/lib/growth/form-route';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const MESSAGE = 'I cannot get streaming tool calls to render in my app.';
const EMAIL_EMPTY = 'I need your email to write back.';
const EMAIL_MALFORMED =
  "That doesn't look like a full address. Try something like jordan@acme.dev.";
const MESSAGE_SHORT = 'Give me a bit more to go on, at least 20 characters.';
const MESSAGE_LONG =
  "That's over 1,000 characters. Send the short version and we'll go from there.";

/** Mounts a fresh form; clears the previous test's DOM first. */
function mount() {
  cleanup();
  vi.mocked(posthog.capture).mockClear();
  return render(<UnstuckForm fallbackAddress={UNSTUCK_FALLBACK_ADDRESS} />);
}

function fill(email: string, message: string) {
  fireEvent.change(screen.getByLabelText('Your email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Where are you stuck?'), {
    target: { value: message },
  });
}

function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

function respond(status: number, body: unknown = { ok: true }) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof respond>, call = 0) {
  const init = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return JSON.parse(init[1].body as string) as Record<string, unknown>;
}

test('renders two fields, the hint, the count and the email fallback beside Send, with no disclosure', () => {
  mount();

  const email = screen.getByLabelText('Your email');
  const message = screen.getByLabelText('Where are you stuck?');
  const button = screen.getByRole('button', { name: 'Send' });
  const hint = screen.getByText(
    'What you expected, what happened instead, and any error text.',
  );
  const link = screen.getByRole('link', { name: UNSTUCK_FALLBACK_ADDRESS });

  expect(email.closest('form')?.noValidate).toBe(true);
  expect(screen.queryByLabelText('Framework')).toBeNull();
  expect(message.tagName).toBe('TEXTAREA');
  expect(hint.id).toBe('unstuck-hint');
  expect(message.getAttribute('aria-describedby')).toBe(
    'unstuck-hint unstuck-count',
  );
  expect(screen.getByText('0 / 1,000').id).toBe('unstuck-count');
  expect(link.getAttribute('href')).toBe('mailto:brian@hashbrown.dev');
  expect(link.closest('p')?.textContent).toBe(
    'Rather email? brian@hashbrown.dev',
  );
  expect(screen.queryByText(/By sending/)).toBeNull();
  expect(button.getAttribute('aria-describedby')).toBeNull();
  const trap = document.querySelector<HTMLInputElement>(
    'input[name="website_url"]',
  );
  expect(trap?.tabIndex).toBe(-1);
  expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
});

test('email validates on blur with the new copy', () => {
  mount();
  const email = screen.getByLabelText('Your email');

  fireEvent.blur(email);

  expect(screen.getByText(EMAIL_EMPTY).id).toBe('unstuck-email-error');
  expect(email.getAttribute('aria-invalid')).toBe('true');
  expect(email.getAttribute('aria-describedby')).toBe('unstuck-email-error');

  fireEvent.change(email, { target: { value: 'jordan@acme' } });
  fireEvent.blur(email);

  expect(screen.getByText(EMAIL_MALFORMED).id).toBe('unstuck-email-error');

  fireEvent.change(email, { target: { value: 'jordan@acme.dev' } });

  expect(screen.queryByText(EMAIL_MALFORMED)).toBeNull();
  expect(email.getAttribute('aria-invalid')).toBeNull();
});

test('message validates on blur and clears as soon as it is valid', () => {
  mount();
  const message = screen.getByLabelText('Where are you stuck?');

  fireEvent.blur(message);

  expect(screen.getByText(MESSAGE_SHORT).id).toBe('unstuck-message-error');
  expect(message.getAttribute('aria-invalid')).toBe('true');
  expect(message.getAttribute('aria-describedby')).toBe(
    'unstuck-hint unstuck-count unstuck-message-error',
  );

  fireEvent.change(message, { target: { value: MESSAGE } });

  expect(screen.queryByText(MESSAGE_SHORT)).toBeNull();
  expect(message.getAttribute('aria-invalid')).toBeNull();

  fireEvent.change(message, { target: { value: 'a'.repeat(1_001) } });
  fireEvent.blur(message);

  expect(screen.getByText(MESSAGE_LONG).id).toBe('unstuck-message-error');
});

test('the message counter measures the trimmed UTF-16 length', () => {
  mount();

  fireEvent.change(screen.getByLabelText('Where are you stuck?'), {
    target: { value: '  hello  ' },
  });

  expect(screen.getByText('5 / 1,000')).toBeTruthy();
});

test('submit focuses the first invalid field and sends nothing', () => {
  const fetchMock = respond(200);
  mount();

  send();

  expect(document.activeElement).toBe(screen.getByLabelText('Your email'));
  expect(screen.getByText(EMAIL_EMPTY)).toBeTruthy();
  expect(screen.getByText(MESSAGE_SHORT)).toBeTruthy();
  expect(
    screen.getByLabelText('Where are you stuck?').getAttribute('aria-invalid'),
  ).toBe('true');
  expect(fetchMock).not.toHaveBeenCalled();

  fill('jordan@acme.dev', 'too short');
  send();

  expect(document.activeElement).toBe(
    screen.getByLabelText('Where are you stuck?'),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a valid submission posts the envelope once, shows the success copy and fires submit then success', async () => {
  const fetchMock = respond(200);
  mount();
  fill(' jordan@acme.dev ', `  ${MESSAGE}  `);

  send();
  fireEvent.submit(
    screen.getByLabelText('Your email').closest('form') as HTMLFormElement,
  );

  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe(
      "Got it. A confirmation is on its way, and I'll reply from brian@hashbrown.dev.",
    ),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(sentBody(fetchMock)).toEqual({
    submission_id: expect.any(String),
    email: 'jordan@acme.dev',
    message: MESSAGE,
    website_url: '',
  });
  expect(vi.mocked(posthog.capture).mock.calls.map((c) => c[0])).toEqual([
    'marketing:unstuck_form_submit',
    'marketing:unstuck_form_success',
  ]);
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
});

test('a retry with identical facts reuses the submission id; changed facts mint a new one', async () => {
  const fetchMock = respond(503, { error: 'x', retryable: true });
  mount();
  fill('jordan@acme.dev', MESSAGE);

  send();
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  send();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Where are you stuck?'), {
    target: { value: `${MESSAGE} Also this.` },
  });
  send();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

  expect(sentBody(fetchMock, 0)['submission_id']).toBe(
    sentBody(fetchMock, 1)['submission_id'],
  );
  expect(sentBody(fetchMock, 2)['submission_id']).not.toBe(
    sentBody(fetchMock, 0)['submission_id'],
  );
});

test('editing after a failure dismisses the failure alert', async () => {
  respond(503, { error: 'x', retryable: true });
  mount();
  fill('jordan@acme.dev', MESSAGE);
  send();
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

  fireEvent.change(screen.getByLabelText('Where are you stuck?'), {
    target: { value: `${MESSAGE} More.` },
  });

  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed request offers the fallback address and fires fail with error_reason', async () => {
  respond(503, { error: 'x', retryable: true });
  mount();
  fill('jordan@acme.dev', MESSAGE);

  send();

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(
    "That didn't send. Try again, or email me at brian@hashbrown.dev.",
  );
  const link = alert.querySelector('a');
  expect(link?.getAttribute('href')).toBe(`mailto:${UNSTUCK_FALLBACK_ADDRESS}`);
  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  const fail = vi
    .mocked(posthog.capture)
    .mock.calls.find((c) => c[0] === 'marketing:unstuck_form_fail');
  expect(fail?.[1]).toMatchObject({
    error_reason: 'api_error',
    surface: 'unstuck',
  });
});

test('the email field caps at 254 characters and rejects angle brackets like the server', () => {
  const fetchMock = respond(200);
  mount();
  const email = screen.getByLabelText('Your email') as HTMLInputElement;

  fill('<jordan@acme.dev>', MESSAGE);
  send();

  expect(email.maxLength).toBe(254);
  expect(screen.getByText(EMAIL_MALFORMED).id).toBe('unstuck-email-error');
  expect(document.activeElement).toBe(email);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('focus moves to the success status once the message is sent', async () => {
  respond(200);
  mount();
  fill('jordan@acme.dev', MESSAGE);

  send();

  const status = await screen.findByRole('status');
  expect(status.tabIndex).toBe(-1);
  expect(document.activeElement).toBe(status);
});
