# atc

A live map of airline traffic over the Pacific Northwest with an assistant that
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

Open http://127.0.0.1:4341/angular/ or http://127.0.0.1:4342/react/. In development the
Angular/React toggle does not work because the apps run on different ports.

Add `?replay=1` to use recorded traffic instead of the live feed; `&tick=1000` speeds it up.

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
Stadia Maps, which authenticates by domain. Run `npx nx record-replay atc` to refresh the
recorded traffic in `shared/public/replay/ord.json`.

## Hosting

`npx nx build atc` writes `.vercel/output`. The hosted project (`hashbrown-atc`) needs:

- `OPENAI_API_KEY`: a dedicated OpenAI project key with a hard monthly budget.
- A Vercel Firewall rate-limit rule on `/api/run` (for example 20 requests per minute per IP).
- `atc.hashbrown.dev` registered as an allowed domain in the Stadia Maps dashboard.
