# Remote Model Context Protocol (MCP)

<p class="subtitle">Expose remote MCP servers to models for better task following and responses.</p>

- Model Context Protocol (MCP) enables the model to use tool calling with remote servers to complete a task or to better respond to user messages.
- Easily integrate remote MCP servers with client-side tool calling.

---

## How it Works

1. Use the `@modelcontextprotocol/sdk` library to create an MCP client.
2. Hashbrown supports both server-sent events (SSE) and streamable HTTP. We recommend the newer streamable HTTP protocol.
3. Connect the client to the remote MCP server.
4. Fetch the list the available tools from the remote MCP server.
5. Map the remote tools to Hashbrown tools.
6. Provide the remote tools from one or more remote MCP servers alongside client-side tools to the model.
7. The model will choose if and when to use a provided tool.

---

## 1: MCP Server

The first step is to either build or consume a remote MCP server.

In most cases, you'll be using a remote MCP server from a third-party.
For the purpose of clarity, we'll briefly walk through creating an MCP server.

<hb-code-example header="MCP server">

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// 1. Create an express server
const app = express();
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['*'],
  }),
);
app.use(
  express.json({
    limit: '30mb',
  }),
);

// 2. Define the response deserializer
class UnhealthyResponseDeserializer implements IResponseDeserializer {
  async deserialize<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (text.length > 0) {
      try {
        const json = JSON.parse(text) as T;
        return json;
      } catch (e: any) {
        console.error(e);
      }
    }

    return null as T;
  }
}

// 3. Define helper function to decode the bearer token
function getAccessToken(context: any): string {
  // check for auth token on request headers
  const authToken = context.requestInfo.headers['authorization'];
  if (!authToken) {
    throw new Error('No authorization token provided');
  }

  // decode the token
  const decoded = decodeURIComponent(authToken.split(' ')[1]);
  return decoded;
}

// 4. Create a remote MCP server
const mcpServer = new McpServer({
  name: 'spotify',
  version: '1.0.0',
  description: 'Spotify server to search songs',
});

// 5. Register a tool
mcpServer.registerTool(
  'search',
  {
    title: 'search',
    description: 'Search tracks, artists or albums on Spotify',
    inputSchema: {
      query: z.string().describe('Search keywords'),
      type: z.enum(['track', 'artist', 'album']).optional(),
    },
  },
  async ({ query, type = 'track' }, context) => {
    const accessToken = getAccessToken(context);
    // TODO: integrate with spotify to search for the track
  },
);

// 6. Configure the transport
const transports: Record<string, StreamableHTTPServerTransport> = {};

function ensureTransport(sessionId: string) {
  if (transports[sessionId]) return transports[sessionId];
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });
  transports[sessionId] = transport;
  // async – never await here or you'll block the first HTTP request
  mcpServer.connect(transport).catch(console.error);
  transport.onclose = () => delete transports[sessionId];
  return transport;
}

// 7. Client → Server (JSON-RPC over HTTP POST)
app.post('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? randomUUID();
  res.setHeader('Mcp-Session-Id', sessionId);
  const transport = ensureTransport(sessionId);
  await transport.handleRequest(req, res, req.body);
});

// 8. Server → Client notifications
app.get('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? randomUUID();

  res.setHeader('Mcp-Session-Id', sessionId);

  const transport = ensureTransport(sessionId);
  await transport.handleRequest(req, res);
});

// 9. Disconnect
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].close();
  }
  res.sendStatus(204);
});

// 10. Hashbrown adapter for OpenAI
app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    request: req.body,
  });

  res.header('Content-Type', 'application/octet-stream');
  for await (const chunk of stream) {
    res.write(chunk);
  }
  res.end();
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://localhost:3001`);
});
```

</hb-code-example>

1. Create an MCP server using the `@modelcontextprotocol/sdk/server` library.
2. Register tools with the MCP server using the `registerTool()` method.
3. Use the `StreamableHTTPServerTransport` to handle requests and responses.
4. Use the `McpServer` to handle incoming requests and send responses.
5. Optionally, create a Hashbrown adapter for OpenAI to handle chat requests.
6. Run the express server and listen for incoming requests.

---

## 2: MCP Client

<hb-code-example header="MCP client">

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function useMcpClient(accessToken: string) {
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function connect() {
      const client = new Client({
        name: 'spotify',
        version: '1.0.0',
        title: 'Spotify',
      });

      await client.connect(
        new StreamableHTTPClientTransport(
          new URL('http://localhost:3001/mcp'),
          {
            requestInit: {
              headers: {
                Authorization: `Bearer ${encodeURIComponent(
                  JSON.stringify(accessToken),
                )}`,
              },
            },
          },
        ),
      );

      if (isMounted) clientRef.current = client;
    }

    connect();

    return () => {
      isMounted = false;
      // Optional: close the remote session
      fetch('http://localhost:3001/mcp', { method: 'DELETE' }).catch(() => {});
    };
  }, [accessToken]);

  return clientRef;
}
```

</hb-code-example>

1. Import the necessary libraries from `@modelcontextprotocol/sdk/client`.
2. Create a React hook to connect to the remote MCP server using the `StreamableHTTPClientTransport`.
3. Use `useRef` to keep a stable `Client` instance. Initialize the connection in `useEffect`.
4. Optionally, call the server's `DELETE /mcp` endpoint on unmount to close the session.

---

## 3. Map Remote Tools to Hashbrown

<hb-code-example header="create tools">

```ts
import type { Chat } from '@hashbrownai/core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

function useRemoteMcpTools(client: Client | null) {
  const [remoteTools, setRemoteTools] = useState<Chat.AnyTool[]>([]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    (async () => {
      const { tools: mcpTools } = await client.listTools();

      const tools: Chat.AnyTool[] = mcpTools.map((tool) => (
        return useTool({
          name: tool.name,
          description: tool.description ?? '',
          schema: {
            ...tool.inputSchema,
            additionalProperties: false,
            required: Object.keys(tool.inputSchema?.properties ?? {}),
          },
          handler: async (input, _abortSignal) => {
            const result = await client.callTool({
              name: tool.name,
              arguments: input,
            });
            return result;
          },
        });
      }));

      if (!cancelled) setRemoteTools(tools);
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return remoteTools;
}
```

</hb-code-example>

1. Fetch the list of tools from the remote MCP server using `client.listTools()`.
2. The `useTool()` hook creates a Hashbrown tool for each remote MCP tool.
3. Implement the `handler` function to call the remote MCP tool using `client.callTool()`.
4. Store the resulting `Chat.AnyTool[]` in React state to be provided to the model.

---

## 4: Provide Remote Tools to the Model

<hb-code-example header="provide tools">

```tsx
import { useChat, useTool } from '@hashbrownai/react';

function App({ accessToken }: { accessToken: string }) {
  // 1) Connect to MCP and load remote tools
  const mcpClientRef = useMcpClient(accessToken);
  const remoteTools = useRemoteMcpTools(mcpClientRef.current);

  // 2) Define any local React tools with useTool()
  const getUser = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: async (abortSignal) => fetchUser({ signal: abortSignal }),
    deps: [fetchUser],
  });

  // 3) Combine remote and local tools
  const tools = useMemo(
    () => [...remoteTools, getUser],
    [remoteTools, getUser],
  );

  // 4) Provide tools to the model
  const chat = useChat({
    tools,
  });

  return null;
}
```

</hb-code-example>

1. Use `useChat()` to provide the combined tools to the model.
2. Combine the remote MCP tools with any local tools you want to provide.
3. The model will now have access to both remote and local tools, allowing it to choose the appropriate tool for a given task.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/functions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>Tool Calling</h4>
      <p>Provide callback functions to the LLM.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose React components to the LLM for generative UI.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/runtime">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Execute LLM-generated JS in the browser (safely)</h4>
      <p>Use Hashbrown's JavaScript runtime for complex and mathematical operations.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
