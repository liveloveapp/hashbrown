# LangChain + LangGraph Server

An aviation flight planning agent using LangChain + LangGraph TypeScript frameworks.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js** (v22 or later)
- **Docker** and **Docker Compose** - for running ChromaDB

## Setup

### 1. Environment Variables

Create a `.env` file in the workspace root (or ensure it exists) with the following:

```env
OPENAI_API_KEY=your_openai_api_key_here
LANGSMITH_API_KEY=optional_deployment_api_key_here
```

### 2. Initialize PDFs, ChromaDB, and ingestion

Run the unified init task (downloads PDFs, starts ChromaDB via Docker Compose if needed, waits for readiness, and ingests PDFs into ChromaDB):

```bash
npx nx run langchain-server:init
```

Use `-- --force` to force re-ingestion even if collections already exist.

ChromaDB will listen on port `8000` and stays running in Docker. To stop it manually:

```bash
docker compose -f samples/langchain/server/docker-compose.yml down
```

### 3. Development

Start the server using Nx (automatically runs the `init` target first):

```bash
npx nx serve langchain-server
```

The server will be available at `http://localhost:2024`

## Additional commands

- Start ChromaDB manually: `docker compose -f samples/langchain/server/docker-compose.yml up -d`
- Download PDFs only: `npx nx run langchain-server:fetch-pdfs`
- Manual ingestion: `npx tsx samples/langchain/server/scripts/ingest.ts`
- Verify ingestion: `npx tsx samples/langchain/server/scripts/verify-ingest.ts`
