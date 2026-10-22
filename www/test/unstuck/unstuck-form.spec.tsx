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
import {
  UNSTUCK_FALLBACK_ADDRESS,
  UNSTUCK_FORM_DISCLOSURE,
  UNSTUCK_FORM_POLICY_VERSION,
} from '../../src/lib/growth/form-route';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const MESSAGE = 'I cannot get streaming tool calls to render in my app.';

/** Mounts a fresh form; clears the previous test's DOM first. */
function mount() {
  cleanup();
  vi.mocked(posthog.capture).mockClear();
  return render(
    <UnstuckForm
      policyVersion={UNSTUCK_FORM_POLICY_VERSION}
      disclosure={UNSTUCK_FORM_DISCLOSURE}
      fallbackAddress={UNSTUCK_FALLBACK_ADDRESS}
    />,
  );
}

function fill(email: string, framework: string, message: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Framework'), {
    target: { value: framework },
  });
  fireEvent.change(screen.getByLabelText('Where are you stuck?'), {
    target: { value: message },
  });
}

function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send to Brian' }));
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

test('renders every field, the disclosure before the button, and the button describes it', () => {
  mount();

  const email = screen.getByLabelText('Email');
  const framework = screen.getByLabelText('Framework') as HTMLSelectElement;
  const message = screen.getByLabelText('Where are you stuck?');
  const button = screen.getByRole('button', { name: 'Send to Brian' });
  const disclosure = screen.getByText(UNSTUCK_FORM_DISCLOSURE);

  expect(email.closest('form')?.noValidate).toBe(true);
  expect(Array.from(framework.options).map((o) => o.text)).toEqual([
    'Select a framework',
    'React',
    'Angular',
    'Both',
    'Not sure yet',
  ]);
  expect(framework.options[0].disabled).toBe(true);
  expect(message.tagName).toBe('TEXTAREA');
  expect(disclosure.id).toBe('unstuck-disclosure');
  expect(button.getAttribute('aria-describedby')).toBe('unstuck-disclosure');
  expect(
    message.compareDocumentPosition(disclosure) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    disclosure.compareDocumentPosition(button) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const trap = document.querySelector<HTMLInputElement>(
    'input[name="website_url"]',
  );
  expect(trap?.tabIndex).toBe(-1);
  expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
});

test('email is validated on blur with the design copy and re-validated on change', () => {
  mount();
  const email = screen.getByLabelText('Email');

  fireEvent.change(email, { target: { value: 'jordan' } });
  fireEvent.blur(email);

  expect(
    screen.getByText('Enter a full address, like jordan@acme.dev.').id,
  ).toBe('unstuck-email-error');
  expect(email.getAttribute('aria-invalid')).toBe('true');
  expect(email.getAttribute('aria-describedby')).toContain(
    'unstuck-email-error',
  );

  fireEvent.change(email, { target: { value: 'jordan@acme.dev' } });

  expect(
    screen.queryByText('Enter a full address, like jordan@acme.dev.'),
  ).toBeNull();
  expect(email.getAttribute('aria-invalid')).toBeNull();
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

  expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  expect(screen.getByText('Pick the framework you are using.').id).toBe(
    'unstuck-framework-error',
  );
  expect(
    screen.getByLabelText('Where are you stuck?').getAttribute('aria-invalid'),
  ).toBe('true');
  expect(fetchMock).not.toHaveBeenCalled();

  fill('jordan@acme.dev', 'react', 'too short');
  send();

  expect(document.activeElement).toBe(
    screen.getByLabelText('Where are you stuck?'),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a valid submission posts the envelope once, shows the success copy and fires submit then success', async () => {
  const fetchMock = respond(200);
  mount();
  fill(' jordan@acme.dev ', 'angular', `  ${MESSAGE}  `);

  send();
  fireEvent.submit(
    screen.getByLabelText('Email').closest('form') as HTMLFormElement,
  );

  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Got it. Brian reads every one of these and replies from brian@hashbrown.dev.',
    ),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(sentBody(fetchMock)).toMatchObject({
    policy_version: UNSTUCK_FORM_POLICY_VERSION,
    email: 'jordan@acme.dev',
    framework: 'angular',
    message: MESSAGE,
  });
  expect(vi.mocked(posthog.capture).mock.calls.map((c) => c[0])).toEqual([
    'marketing:unstuck_form_submit',
    'marketing:unstuck_form_success',
  ]);
  expect(screen.queryByRole('button', { name: 'Send to Brian' })).toBeNull();
});

test('a retry with identical facts reuses the submission id; changed facts mint a new one', async () => {
  const fetchMock = respond(503, { error: 'x', retryable: true });
  mount();
  fill('jordan@acme.dev', 'react', MESSAGE);

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

test('409 shows the refresh screen and fires fail with stale_form', async () => {
  respond(409, { policy_version: 'newer' });
  mount();
  fill('jordan@acme.dev', 'both', MESSAGE);

  send();

  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('out of date'),
  );
  expect(screen.getByRole('button', { name: 'Refresh page' })).toBeTruthy();
  expect(vi.mocked(posthog.capture).mock.calls.map((c) => c[0])).toEqual([
    'marketing:unstuck_form_submit',
    'marketing:unstuck_form_fail',
  ]);
  expect(vi.mocked(posthog.capture).mock.calls[1][1]).toMatchObject({
    error_reason: 'stale_form',
  });
});

test('editing after a failure dismisses the failure alert', async () => {
  respond(503, { error: 'x', retryable: true });
  mount();
  fill('jordan@acme.dev', 'react', MESSAGE);
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
  fill('jordan@acme.dev', 'not_sure', MESSAGE);

  send();

  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  const link = screen.getByRole('link', { name: UNSTUCK_FALLBACK_ADDRESS });
  expect(link.getAttribute('href')).toBe(`mailto:${UNSTUCK_FALLBACK_ADDRESS}`);
  expect(screen.getByRole('button', { name: 'Send to Brian' })).toBeTruthy();
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
  const email = screen.getByLabelText('Email') as HTMLInputElement;

  fill('<jordan@acme.dev>', 'react', MESSAGE);
  send();

  expect(email.maxLength).toBe(254);
  expect(
    screen.getByText('Enter a full address, like jordan@acme.dev.').id,
  ).toBe('unstuck-email-error');
  expect(document.activeElement).toBe(email);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('focus moves to the success status once the message is sent', async () => {
  respond(200);
  mount();
  fill('jordan@acme.dev', 'react', MESSAGE);

  send();

  const status = await screen.findByRole('status');
  expect(status.tabIndex).toBe(-1);
  expect(document.activeElement).toBe(status);
});

test('focus moves to the refresh notice when the form is out of date', async () => {
  respond(409, { policy_version: 'newer' });
  mount();
  fill('jordan@acme.dev', 'react', MESSAGE);

  send();

  const alert = await screen.findByRole('alert');
  expect(document.activeElement).toBe(alert);
});
