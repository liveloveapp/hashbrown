# LangChain + Next UI

Hashbrown-powered Next.js frontend that renders structured UI responses from LangGraph and CopilotKit-backed agents.

## Prerequisites

- Node.js 22+
- `OPENAI_API_KEY` set in the workspace root `.env` (used by `/api/hashbrown` for Hashbrown OpenAI streaming)
- The LangGraph server from `samples/langchain/server` running on `http://localhost:2024` (needed for both `/copilotkit` and `/langgraph`)

## Run the app

1. Install dependencies at the repo root if you haven’t already: `npm install`
2. Start the LangGraph backend in another terminal: `npx nx serve langchain-server`
3. Start the Next.js dev server: `npx nx run langchain-next:dev`
4. Open `http://localhost:3000/copilotkit` (CopilotKit runtime) or `http://localhost:3000/langgraph` (LangGraph SDK). The root route `/` redirects to `/copilotkit`.

## Routes and APIs

- `/copilotkit`: Uses `@copilotkitnext/react` plus Hashbrown UI primitives. The API handler at `/api/copilotkit` proxies to the LangGraph deployment via `LangGraphAgent`.
- `/langgraph`: Uses `@langchain/langgraph-sdk/react` to stream the same plan agent directly from `http://localhost:2024`.
- `/api/hashbrown`: Thin wrapper around `HashbrownOpenAI.stream.text` for local UI completions with your `OPENAI_API_KEY`.
