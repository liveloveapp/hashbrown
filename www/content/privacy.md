# Privacy

This page explains what Hashbrown collects, who processes it, how long we keep it, and how to opt out or ask for deletion. Hashbrown is built by LiveLoveApp, LLC.

## What we collect

**Visits to hashbrown.dev.** We record website visits and page views on hashbrown.dev so we can see which docs and posts people read.

**Install and development observations from the packages.** When you install a `@hashbrownai/*` package, a postinstall step sends one `package.installed` event describing the package, your operating system, CPU architecture, Node version, package manager, and whether the install ran in CI, together with a random per-user id that each package reads from or creates in `~/.hashbrown/installation-id` so repeat installs on one machine are counted once. Outside CI, when Git is configured, it also sends your Git `user.name`, `user.email`, and the owner of the `origin` remote on GitHub, GitLab, or Bitbucket. In a development build in a browser, the packages report when a chat runtime starts, the first completed stream, the first tool call, and the first rendered component, once per session. Production builds, server rendering, automated browsers, and test runners send nothing. None of these observations include prompts, messages, schemas, tool arguments, component props, URLs, or thread identifiers. The full field list is in the docs at [What Hashbrown Sends](/docs/react/platform/collection).

**The Get unstuck form and email replies.** When the Get unstuck form launches and you fill it in, or when you reply to one of our emails, we keep what you wrote and the address you wrote from so we can answer you.

## Who processes it

We store this data ourselves and use these processors to run the site:

- **Vercel** hosts hashbrown.dev and the collection endpoints.
- **Neon** runs the Postgres database where observations and contacts are stored.
- **PostHog** provides product analytics for website visits.
- **Resend** sends our email.
- **Google Workspace** hosts the mailbox that receives your replies.

## How long we keep it

We keep this data indefinitely by default, until you ask us to delete it.

## Email

The Get unstuck form and the founder install digest are upcoming. When they launch, opting in through either one sends you one short sequence of emails from the founder. Every email has an unsubscribe link, and replies go to a human.

## Your choices

You can turn off each kind of collection:

- Set `DO_NOT_TRACK=1` or `HASHBROWN_TELEMETRY_DISABLED=1` in the environment to stop the install step. `HASHBROWN_TELEMETRY_DEBUG=1` prints what would be sent and sends nothing.
- Run `localStorage.setItem('HASHBROWN_TELEMETRY_DISABLED', '1')` or set `window.__HASHBROWN_TELEMETRY_DISABLED__ = true` to stop the browser collector.
- Use `<HashbrownProvider telemetry={false}>` (React) or `provideHashbrown({ telemetry: false })` (Angular) to stop it for the app. A nested provider cannot turn it back on.
- Call `setDevelopmentCollectionEnabled(false)` from `@hashbrownai/react` or `@hashbrownai/angular` before the first runtime is created.
- Use the unsubscribe link in any email to stop email.

## Deletion

Email [brian@hashbrown.dev](mailto:brian@hashbrown.dev) to ask for deletion. We clear the contact fields tied to your address, remove the project mapping, cancel any scheduled email, and redact your observations. A one-way hash of the address and the record that you asked us to stop remain, so we never contact you again.

## Contact

Questions about this page go to [brian@hashbrown.dev](mailto:brian@hashbrown.dev).
