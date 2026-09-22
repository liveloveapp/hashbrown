---
title: 'Example App: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Explore the maintained invoicing example with React, B4 and Pretable.'
---

# Invoicing Example

The maintained example uses React, Hashbrown, B4 and Pretable to explore a
simulated ledger, answer questions with generated UI, and review payment
allocations before applying them. All data and allocations are simulated.

[Try the app](https://invoicing.hashbrown.dev) or
[read the source and setup guide](https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing).

## Run locally

Clone the repository and install its dependencies:

```bash
git clone https://github.com/liveloveapp/hashbrown.git
cd hashbrown
nvm use
npm ci
```

Create an environment file containing `OPENAI_API_KEY`, then start the server:

```bash
INVOICING_ENV_FILE=/path/to/.env npx nx serve invoicing-server
```

In another terminal, start the React frontend:

```bash
npx nx serve invoicing-react
```

Open http://127.0.0.1:4326/. Credentials are loaded only by the server.

## Framework guidance

The public example is a React application. Angular and React protocol coverage
lives in internal conformance hosts within the example's end-to-end suite.
For framework integration, follow the
[Angular quickstart](/docs/angular/start/quick) or
[React quickstart](/docs/react/start/quick). The standalone
[UI chatbot recipe](/docs/angular/recipes/ui-chatbot) remains available.

The former Smart Home example has been retired.
