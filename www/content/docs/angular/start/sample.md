---
title: 'Example App: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'atc: a live map of air traffic with an assistant that answers in your own Angular components.'
---

# atc Example

atc is a live map of the air traffic over the Pacific Northwest, with an assistant that answers in the app's own Angular components.
It's Hashbrown's flagship example, and it's built twice, in Angular and React, on one shared core.

Here's the whole thing in about a minute:

<www-atc-demo-video>
</www-atc-demo-video>

[Fly atc live](https://atc.hashbrown.dev/angular/) or
[read the source](https://github.com/liveloveapp/hashbrown/tree/main/examples/atc).

---

## Three Steps

atc shows Hashbrown in three steps.
You type into one composer, and a badge shows where Enter will send the text.

1. **Decide.** A TypeSafe Jev decision routes what you typed: to the map filter, to clearing the filter, or to the chat. For a chat message, a second decision picks which cards fit.
2. **Filter.** A structured completion streams a map filter into a pill of chips. The filter is app state, so the map dims every plane it hides, and a "Refine:" row offers ways to narrow it.
3. **Generate.** A question goes to the chat, which calls tools in the browser and answers with Markdown and the app's own cards.

Here's a filter, "Alaska Airlines near Seattle", applied to the map:

<img src="/image/docs/atc/filter.webp" width="1280" height="800" loading="lazy" alt="The map filtered to Alaska Airlines within 25 nm of KSEA, with the filter chips over the map and a Refine suggestion above the composer." />

And here's the answer to "What's flying near Bend?": an arrivals board, with the same planes highlighted on the map:

<img src="/image/docs/atc/answer.webp" width="1280" height="800" loading="lazy" alt="The chat answering What's flying near Bend? with a board of three flights, and the same three planes highlighted on the map." />

---

## The Developer Drawer

Press the `{ }` button on the rail to open the developer drawer under the map.
It shows each layer's JSON as it arrives for the newest send, in five tabs: Router, Cards, Filter, UI stream and Tools.
Dev mode is off on a first visit, and the choice is remembered.

<img src="/image/docs/atc/drawer-router.webp" width="1280" height="800" loading="lazy" alt="The developer drawer open on its Router tab, showing typed text routed to the filter at 0.97 confidence." />

---

## What to Look For

The core file, [`examples/atc/angular/src/app/assistant.ts`](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/angular/src/app/assistant.ts), is organized into the same numbered steps as its twin in the other framework.
A few things to note:

- **Your components, not generated HTML.** `exposeComponent` lists every component the model may use, with a Skillet schema for each of its inputs.
- **Fields that must arrive whole do.** A card's aircraft ID is `s.string`, so a card never shows a half-written ID. Its note is `s.streaming.string`, and it streams in.
- **Tools run in the browser.** `createTool` wraps functions that search, highlight and follow the aircraft already on the map. The plane list never goes to the server.
- **The chat streams UI.** `uiChatResource` renders only the components you exposed, and the cards keep updating after the answer finishes.
- **Decisions route and narrow.** `decisionResource` routes typed text in [`router.ts`](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/angular/src/app/router.ts), and `uiDecisionResource` picks the cards for each chat message. An unsure or failed decision never blocks a send.
- **A filter is structured output.** `structuredCompletionResource` streams the map filter in [`filter.ts`](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/angular/src/app/filter.ts).
- **The server pins the model routes.** `/api/run`, `/api/filter` and `/api/decide` each fix their prompt or questions, schemas and output cap. [Securing a public endpoint](/docs/angular/recipes/public-endpoint) shows how.

---

## Run Locally

```bash
git clone https://github.com/liveloveapp/hashbrown.git
cd hashbrown
nvm use
npm ci
```

Add `OPENAI_API_KEY=...` to the `.env` file at the root of the repository.
`TYPESAFE_API_KEY` is optional: without it, everything you type goes to the chat.
Then, start the server and the app in two terminals:

```bash
npx nx serve atc-server
```

```bash
npx nx serve atc-angular
```

Open http://127.0.0.1:4341/angular/.
The [README](https://github.com/liveloveapp/hashbrown/blob/main/examples/atc/README.md) has the rest: every variable, a tour of the code by step, hosting and troubleshooting.
