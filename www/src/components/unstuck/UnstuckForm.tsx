'use client';

import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import styles from './UnstuckForm.module.css';
import { type UnstuckFacts, useUnstuckForm } from './use-unstuck-form';

const FRAMEWORKS = [
  ['react', 'React'],
  ['angular', 'Angular'],
  ['both', 'Both'],
  ['not_sure', 'Not sure yet'],
] as const;

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 1_000;

/** Loose shape check, something@something.tld; the server normalizes for real. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function emailError(value: string): string | null {
  const email = value.trim();
  if (email.length === 0) return 'Enter your email address.';
  if (!EMAIL_SHAPE.test(email))
    return 'Enter a full address, like jordan@acme.dev.';
  return null;
}

function frameworkError(value: string): string | null {
  return value === '' ? 'Pick the framework you are using.' : null;
}

/** Measured like the server: trimmed, in UTF-16 code units. */
function messageError(value: string): string | null {
  const length = value.trim().length;
  if (length < MESSAGE_MIN) {
    return 'Tell Brian a little more, at least 20 characters.';
  }
  if (length > MESSAGE_MAX) return 'Keep it to 1,000 characters or fewer.';
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
 * The Get unstuck form: email, framework and "Where are you stuck?", the
 * consent disclosure, and Send. Validation is by hand (`noValidate`) so errors
 * are linked to their fields; the first invalid field takes focus on submit.
 *
 * @param props.policyVersion - The consent copy version sent with the request.
 * @param props.disclosure - The consent copy shown above the button.
 * @param props.fallbackAddress - Where to write if sending fails.
 */
export function UnstuckForm({
  policyVersion,
  disclosure,
  fallbackAddress,
}: {
  policyVersion: string;
  disclosure: string;
  fallbackAddress: string;
}) {
  const form = useUnstuckForm({ policyVersion });
  const [email, setEmail] = useState('');
  const [framework, setFramework] = useState('');
  const [message, setMessage] = useState('');
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [frameworkMessage, setFrameworkMessage] = useState<string | null>(null);
  const [messageMessage, setMessageMessage] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const frameworkRef = useRef<HTMLSelectElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  /** Dismiss a lingering failure alert once the visitor starts editing. */
  function edited() {
    if (form.status === 'failed') form.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems = [
      emailError(email),
      frameworkError(framework),
      messageError(message),
    ] as const;
    setEmailMessage(problems[0]);
    setFrameworkMessage(problems[1]);
    setMessageMessage(problems[2]);
    if (problems[0]) {
      emailRef.current?.focus();
      return;
    }
    if (problems[1]) {
      frameworkRef.current?.focus();
      return;
    }
    if (problems[2]) {
      messageRef.current?.focus();
      return;
    }

    const honeypot = new FormData(event.currentTarget).get('website_url');
    void form.submit({
      email: email.trim(),
      framework: framework as UnstuckFacts['framework'],
      message: message.trim(),
      website_url: typeof honeypot === 'string' ? honeypot : '',
    });
  }

  if (form.status === 'sent') {
    return (
      <div className={styles.status} role="status">
        <strong>Got it.</strong> Brian reads every one of these and replies from
        brian@hashbrown.dev.
      </div>
    );
  }

  if (form.status === 'stale') {
    return (
      <div className={styles.status} role="alert">
        <p>
          <strong>This page is out of date.</strong> Refresh it before sending
          again.
        </p>
        <button
          className={styles.button}
          type="button"
          onClick={() => window.location.reload()}
        >
          Refresh page
        </button>
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
      <Field id="unstuck-email" label="Email" error={emailMessage}>
        <input
          {...controlProps('unstuck-email', emailMessage)}
          ref={emailRef}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            edited();
            setEmail(event.target.value);
            if (emailMessage) setEmailMessage(emailError(event.target.value));
          }}
          onBlur={() => setEmailMessage(emailError(email))}
        />
      </Field>
      <Field id="unstuck-framework" label="Framework" error={frameworkMessage}>
        <select
          {...controlProps('unstuck-framework', frameworkMessage)}
          ref={frameworkRef}
          value={framework}
          onChange={(event) => {
            edited();
            setFramework(event.target.value);
            if (frameworkMessage) {
              setFrameworkMessage(frameworkError(event.target.value));
            }
          }}
        >
          <option value="" disabled>
            Select a framework
          </option>
          {FRAMEWORKS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="unstuck-message"
        label="Where are you stuck?"
        error={messageMessage}
      >
        <textarea
          {...controlProps('unstuck-message', messageMessage, 'unstuck-count')}
          ref={messageRef}
          rows={6}
          value={message}
          onChange={(event) => {
            edited();
            setMessage(event.target.value);
            if (messageMessage)
              setMessageMessage(messageError(event.target.value));
          }}
        />
        <p
          className={length > MESSAGE_MAX ? styles.countOver : styles.count}
          id="unstuck-count"
        >
          {length.toLocaleString('en-US')} / 1,000
        </p>
      </Field>
      <p className={styles.disclosure} id="unstuck-disclosure">
        {disclosure}
      </p>
      <button
        className={styles.button}
        type="submit"
        aria-describedby="unstuck-disclosure"
        aria-busy={pending || undefined}
        disabled={pending}
      >
        {pending ? 'Sending…' : 'Send to Brian'}
      </button>
      {form.status === 'failed' ? (
        <div className={styles.status} role="alert">
          <strong>That did not send.</strong> Write to Brian at{' '}
          <a href={`mailto:${fallbackAddress}`}>{fallbackAddress}</a> instead,
          or try again.
        </div>
      ) : null}
    </form>
  );
}
