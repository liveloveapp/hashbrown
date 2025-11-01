# LangChain + LangGraph Server

An aviation flight planning agent using LangChain + LangGraph TypeScript frameworks.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js** (v22 or later)
- **Docker** and **Docker Compose** - for running ChromaDB

## Setup

### 1. Start ChromaDB

ChromaDB runs in a Docker container, so you don't need to install Python or any other dependencies. Simply ensure Docker and Docker Compose are installed and running on your system.

Start the ChromaDB server using Docker Compose:

```bash
docker-compose up -d
```

This will start ChromaDB on port `8000`. You can verify it's running by checking:

```bash
docker ps
```

Or visit `http://localhost:8000/api/v1/heartbeat` in your browser.

To stop ChromaDB:

```bash
docker-compose down
```

### 2. Environment Variables

Create a `.env` file in the workspace root (or ensure it exists) with the following:

```env
OPENAI_API_KEY=your_openai_api_key_here
LANGSMITH_API_KEY=optional_deployment_api_key_here
```

## Ingesting PDFs

To ingest PDF files into ChromaDB, place PDF files in the `data/` directory and run:

```bash
npx tsx samples/langchain/server/ingest/index.ts
```

Or verify ingestion:

```bash
npx tsx samples/langchain/server/ingest/verify-ingest.ts
```

## Development

Start the server using Nx:

```bash
npx nx serve langchain-server
```

The server will be available at `http://localhost:2024`
