# LangChain Server

A LangChain-powered Express server that provides a chat API with agent capabilities, using ChromaDB for vector storage and retrieval.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js** (v18 or later)
- **Python** (3.8 or later) - required for ChromaDB
- **pip** - Python package manager
- **Docker** and **Docker Compose** - for running ChromaDB

### Installing Python and pip

**macOS:**

```bash
# Using Homebrew
brew install python3

# Verify installation
python3 --version
pip3 --version
```

**Windows:**
Download and install Python from [python.org](https://www.python.org/downloads/). Make sure to check "Add Python to PATH" during installation.

## Setup

### 1. Install ChromaDB Server

The ChromaDB server is run using Docker Compose, so you don't need to install it separately. However, ensure Docker is installed and running on your system.

### 2. Environment Variables

Create a `.env` file in the workspace root (or ensure it exists) with the following:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### 3. Start ChromaDB

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

### 4. Start the LangChain Server

Start the server using Nx:

```bash
npx nx serve langchain-server
```

The server will be available at `http://localhost:3000` (or the port specified in your `PORT` environment variable).

## Usage

### Chat API

Send POST requests to `/chat` with the following payload:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather like in San Francisco?"
    }
  ],
  "thread_id": "optional-thread-id",
  "user_id": "optional-user-id"
}
```

### Ingesting PDFs

To ingest PDF files into ChromaDB, place PDF files in the `data/` directory and run:

```bash
# Build the project first
nx build langchain-server

# Run the ingest script
npx tsx dist/samples/langchain/server/ingest/index.ts
```

Or verify ingestion:

```bash
npx tsx dist/samples/langchain/server/ingest/verify-ingest.ts
```

## Project Structure

- `src/main.ts` - Express server and agent setup
- `src/agents/` - Agent implementations
- `src/tools/` - Agent tools
- `ingest/` - PDF ingestion scripts
- `data/` - PDF files to be ingested
- `docker-compose.yml` - ChromaDB configuration

## Development

Build the project:

```bash
nx build langchain-server
```

Run in development mode (with hot reload):

```bash
nx serve langchain-server
```
