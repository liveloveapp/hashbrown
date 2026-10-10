# atc

A live map of air traffic over the Pacific Northwest with an assistant that
answers in your own components. Hashbrown's flagship example, in Angular and React.

- `shared/` is plain TypeScript: the aircraft store, the tools, the component contracts and the map.
- `angular/src/app/assistant.ts` and `react/src/assistant.tsx` are the core files: expose
  components, give the model tools, render the stream.
- `server/` has two routes: `/api/run` (the model) and `/api/aircraft` (adsb.lol, cached).

## Run locally

Put `OPENAI_API_KEY=...` in the repository's `.env`, then run each in its own terminal:

```bash
npx nx serve atc-server
```

```bash
npx nx serve atc-angular
```

```bash
npx nx serve atc-react
```

Open http://127.0.0.1:4341/angular/ or http://127.0.0.1:4342/react/. The two apps run on
different ports and have no switcher between them.

## Swap the model provider

`server/src/run-handler.ts` uses `HashbrownOpenAI`. To use another provider, install its
adapter (for example `@hashbrownai/anthropic`), replace `HashbrownOpenAI.stream.text` with
`HashbrownAnthropic.stream.text`, and set that provider's key and model.

## Tests

```bash
npx nx run-many -t test,lint -p atc-shared atc-server atc-react atc-angular atc-e2e
```

```bash
npx nx e2e atc-e2e
```

## Data

Aircraft data comes from [adsb.lol](https://adsb.lol) under the ODbL. Map tiles are from
Stadia Maps, which authenticates by domain. The browser polls `/api/aircraft` every 3 s;
the server shares one adsb.lol call per area across requests, reuses it for 10 s, and
serves the last good snapshot (marked `X-Atc-Stale: 1`) for up to 60 s when adsb.lol
fails. The e2e tests stub `/api/aircraft` with synthetic frames.

## Hosting

Only the Angular app is hosted, at https://atc.hashbrown.dev/angular/ (the root redirects
there). The React app is built and tested in this repository but runs locally for now;
`HOSTED_APPS` in `tools/build-vercel-output.mts` is the one line to change to host it.

`npx nx build atc` writes `.vercel/output`. The hosted project (`hashbrown-atc`) needs:

- `OPENAI_API_KEY`: a dedicated OpenAI project key with a hard monthly budget.
- A Vercel Firewall rate-limit rule on `/api/run` (for example 20 requests per minute per IP).
- `atc.hashbrown.dev` registered as an allowed domain in the Stadia Maps dashboard.
