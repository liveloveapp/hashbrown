---
title: 'What Hashbrown Sends: Hashbrown React Docs'
meta:
  - name: description
    content: 'The anonymous usage observations Hashbrown sends, and every way to turn them off.'
---

# What Hashbrown Sends

Hashbrown sends two kinds of anonymous usage observations so we can see where developers get stuck: one when a package is installed, and a few while you develop in a browser. Neither includes prompts, messages, schemas, tool arguments, component props, URLs, or thread identifiers.

## When you install

Every `@hashbrownai/*` package runs a postinstall step that sends one `package.installed` event for that package. The event carries:

| Field                                     | What it holds                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `packageName`, `packageVersion`           | The package that was installed                                                     |
| `osFamily`, `architecture`                | Your operating system family and CPU architecture                                  |
| `nodeVersion`                             | The Node version that ran the install                                              |
| `packageManager`, `packageManagerVersion` | The package manager and its version, when known                                    |
| `environment`                             | `local`, `ci`, or `unknown`                                                        |
| `environmentEvidence`, `ciProvider`       | Why the environment was classified that way, and the CI provider when there is one |
| `consumerContext`                         | Whether the install ran inside a Git checkout                                      |

Outside CI, when Git is configured in the installing checkout or globally, the event also carries your Git `user.name`, your Git `user.email`, and the owner of the checkout's `origin` remote when it is hosted on GitHub, GitLab, or Bitbucket. Nothing from Git is sent from CI.

The step finishes within five seconds and never fails an installation. `@hashbrownai/core` also writes a random installation id into its own package folder (`development-install.mjs` and `development-install.cjs`) so a development browser can cite the same install.

## While you develop

In a development build running in a browser, Hashbrown reports a few milestones, each once per session. A development build is one where `process.env.NODE_ENV` is not `'production'`. Production builds, server rendering, and automated browsers (where `navigator.webdriver` is set) send nothing.

| Event                            | When                                            | Fields                                                                                     |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `runtime.session_started`        | The first chat runtime in a session starts      | Package name and version, framework, transport kind                                        |
| `runtime.first_stream_completed` | The first model stream completes                | The same, plus a coarse duration bucket (under 1 s, 1 to 5 s, 5 to 30 s, or 30 s and more) |
| `tool.first_call_executed`       | The first tool call runs                        | Package name and version, framework, transport kind                                        |
| `component.first_rendered`       | The first component the model chose is rendered | Package name and version, framework, transport kind                                        |

The framework is `react` or `angular`. The transport kind is `http`, `local`, `delegating`, or `custom`. Every event also carries a random browser id, a session id that rolls over after 30 minutes without activity, and, when the browser can read it from `@hashbrownai/core`, the random installation id written at install time.

## Turning it off

Stop the install step with either environment variable:

```sh
DO_NOT_TRACK=1 npm install
HASHBROWN_TELEMETRY_DISABLED=1 npm install
```

To see exactly what the install step would send, set `HASHBROWN_TELEMETRY_DEBUG=1`. It prints the event and sends nothing.

Stop the browser collector for one browser from the developer console:

```js
localStorage.setItem('HASHBROWN_TELEMETRY_DISABLED', '1');
```

Or for the page, before Hashbrown loads:

```js
window.__HASHBROWN_TELEMETRY_DISABLED__ = true;
```

Turn it off for the whole app with the provider. A nested `HashbrownProvider` cannot turn it back on:

```tsx
import { HashbrownProvider } from '@hashbrownai/react';

export function App() {
  return (
    <HashbrownProvider url="/api/chat" telemetry={false}>
      <Chat />
    </HashbrownProvider>
  );
}
```

Or turn it off in code before the first runtime is created:

```ts
import { setDevelopmentCollectionEnabled } from '@hashbrownai/react';

setDevelopmentCollectionEnabled(false);
```

`getDevelopmentCollectionDiagnostics()` returns counters only, so you can check what the collector did without seeing any payload.

## Where it goes

Install events go to `https://hashbrown.dev/_/growth/collect/v1/install` and development events go to `https://hashbrown.dev/_/growth/collect/v1/runtime`. The data is stored by Hashbrown in a database processed by Vercel (hosting) and Neon (Postgres). It is kept until you ask us to delete it. The [privacy page](/privacy) lists every processor for the site as a whole.

## Deleting your data

Email [brian@hashbrown.dev](mailto:brian@hashbrown.dev) from the address you want removed. We clear the contact fields tied to it, remove its project mapping, cancel any scheduled email, and redact its observations. A one-way hash of the email address remains so we do not contact you again.
