'use client';

import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import styles from './UnstuckForm.module.css';
import { useUnstuckForm } from './use-unstuck-form';

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 1_000;
/** The prompt shown under the message box. */
const MESSAGE_HINT =
  'What you expected, what happened instead, and any error text.';

/**
 * Loose shape check, something@something.tld, refusing `<` and `>` as the
 * server does; the server normalizes for real.
 */
const EMAIL_SHAPE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/u;
/** The longest address the server accepts. */
const EMAIL_MAX = 254;

/** Moves focus to a status as it mounts, so it is announced and not lost. */
function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}

function emailError(value: string): string | null {
  const email = value.trim();
  if (email.length === 0) return 'I need your email to write back.';
  if (!EMAIL_SHAPE.test(email)) {
    return "That doesn't look like a full address. Try something like jordan@acme.dev.";
  }
  return null;
}

/** Measured like the server: trimmed, in UTF-16 code units. */
function messageError(value: string): string | null {
  const length = value.trim().length;
  if (length < MESSAGE_MIN) {
    return 'Give me a bit more to go on, at least 20 characters.';
  }
  if (length > MESSAGE_MAX) {
    return "That's over 1,000 characters. Send the short version and we'll go from there.";
  }
  return null;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The ids and ARIA attributes every control shares. */
function controlProps(id: string, error: string | null, extra?: string) {
  return {
    id,
    className: styles.control,
    'aria-invalid': error ? true : undefined,
    'aria-describedby':
      [extra, error ? `${id}-error` : undefined].filter(Boolean).join(' ') ||
      undefined,
  };
}

/**
 * The Get unstuck form: two fields, "Your email" and "Where are you stuck?",
 * then Send with the email address beside it for anyone who would rather
 * write directly. There is no consent disclosure. Each field validates when it
 * loses focus and again on every change while it shows an error. Validation is
 * by hand (`noValidate`) so errors are linked to their fields; the first
 * invalid field takes focus on submit.
 *
 * @param props.fallbackAddress - The address offered beside Send, in the sent
 * copy and when sending fails.
 */
export function UnstuckForm({ fallbackAddress }: { fallbackAddress: string }) {
  const form = useUnstuckForm();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [messageMessage, setMessageMessage] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  /** Dismiss a lingering failure alert once the visitor starts editing. */
  function edited() {
    if (form.status === 'failed') form.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailProblem = emailError(email);
    const messageProblem = messageError(message);
    setEmailMessage(emailProblem);
    setMessageMessage(messageProblem);
    if (emailProblem) {
      emailRef.current?.focus();
      return;
    }
    if (messageProblem) {
      messageRef.current?.focus();
      return;
    }

    const honeypot = new FormData(event.currentTarget).get('website_url');
    void form.submit({
      email: email.trim(),
      message: message.trim(),
      website_url: typeof honeypot === 'string' ? honeypot : '',
    });
  }

  if (form.status === 'sent') {
    return (
      <div
        className={styles.status}
        role="status"
        tabIndex={-1}
        ref={focusOnMount}
      >
        <strong>Got it.</strong> A confirmation is on its way, and I&apos;ll
        reply from {fallbackAddress}.
      </div>
    );
  }

  const pending = form.status === 'pending';
  const length = message.trim().length;

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      <div aria-hidden="true" className={styles.trap}>
        <input
          type="text"
          name="website_url"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          maxLength={200}
          defaultValue=""
        />
      </div>
      <Field id="unstuck-email" label="Your email" error={emailMessage}>
        <input
          {...controlProps('unstuck-email', emailMessage)}
          ref={emailRef}
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={EMAIL_MAX}
          value={email}
          onChange={(event) => {
            edited();
            setEmail(event.target.value);
            if (emailMessage) setEmailMessage(emailError(event.target.value));
          }}
          onBlur={() => setEmailMessage(emailError(email))}
        />
      </Field>
      <Field
        id="unstuck-message"
        label="Where are you stuck?"
        error={messageMessage}
      >
        <textarea
          {...controlProps(
            'unstuck-message',
            messageMessage,
            'unstuck-hint unstuck-count',
          )}
          ref={messageRef}
          rows={6}
          value={message}
          onChange={(event) => {
            edited();
            setMessage(event.target.value);
            if (messageMessage)
              setMessageMessage(messageError(event.target.value));
          }}
          onBlur={() => setMessageMessage(messageError(message))}
        />
        <div className={styles.below}>
          <p className={styles.hint} id="unstuck-hint">
            {MESSAGE_HINT}
          </p>
          <p
            className={length > MESSAGE_MAX ? styles.countOver : styles.count}
            id="unstuck-count"
          >
            {length.toLocaleString('en-US')} / 1,000
          </p>
        </div>
      </Field>
      <div className={styles.footerRow}>
        <button
          className={styles.button}
          type="submit"
          aria-busy={pending || undefined}
          disabled={pending}
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <p className={styles.alternative}>
          Rather email?{' '}
          <a href={`mailto:${fallbackAddress}`}>{fallbackAddress}</a>
        </p>
      </div>
      {form.status === 'failed' ? (
        <div className={styles.status} role="alert">
          <strong>That didn&apos;t send.</strong> Try again, or email me at{' '}
          <a href={`mailto:${fallbackAddress}`}>{fallbackAddress}</a>.
        </div>
      ) : null}
    </form>
  );
}
