---
title: 'Example App: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'atc: a live map of airline traffic with an assistant that answers in your own Angular components.'
---

# atc Example

atc is a live map of airline traffic over the Pacific Northwest. Ask about the planes you
see, and the answer renders as the app's own components: flight cards, an arrivals board
and side-by-side comparisons. The cards keep updating after the answer finishes, and the
assistant can highlight and follow aircraft on the map.

[Try the app](https://atc.hashbrown.dev/angular/) or
[read the source](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/README.md).

## What to look for

- **Your components, not generated HTML.** `exposeComponent` lists every component the
  model may use, with a Skillet schema for each of its inputs.
- **Tools run in the browser.** `createTool` wraps functions that search the aircraft
  already on the map. The plane list never goes to the server.
- **Fields that must arrive whole do.** A card's aircraft ID is `s.string`, so the card
  never shows a half-written ID. Its note is `s.streaming.string` and streams in.
- **A thin server.** One route (`/api/run`) streams the model's answer and another (`/api/aircraft`)
  proxies the aircraft feed; the system prompt and model are pinned on the server.

The core file is
[`examples/atc/angular/src/app/assistant.ts`](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/angular/src/app/assistant.ts).

## Run locally

```bash
git clone https://github.com/liveloveapp/hashbrown.git
cd hashbrown
nvm use
npm ci
```

Add `OPENAI_API_KEY=...` to `.env`, then start the server and the app in two terminals:

```bash
npx nx serve atc-server
```

```bash
npx nx serve atc-angular
```

Open http://127.0.0.1:4341/angular/. Add `?replay=1` to use recorded traffic.
