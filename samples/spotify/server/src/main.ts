/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express from 'express';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IResponseDeserializer, SpotifyApi } from '@spotify/web-api-ts-sdk';
import type { Track } from '@spotify/web-api-ts-sdk';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Client as GeniusClient } from 'genius-lyrics';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 5150;

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

async function getSpotifyClient(accessToken: string): Promise<SpotifyApi> {
  return SpotifyApi.withAccessToken(
    process.env.SPOTIFY_CLIENT_ID!,
    JSON.parse(decodeURIComponent(accessToken)) as any,
    {
      deserializer: new UnhealthyResponseDeserializer(),
    },
  );
}

/**************************************************
 * MCP Server
 **************************************************/

const mcpServer = new McpServer({
  name: 'spotify',
  version: '1.0.0',
});

const searchInputZodSchema = z.object({
  query: z.string().describe('Search keywords'),
  type: z.enum(['track', 'artist', 'album']).optional(),
});

const searchInputSchema = zodToJsonSchema(searchInputZodSchema) as Record<
  string,
  unknown
>;

const queueTrackInputZodSchema = z.object({
  uri: z
    .string()
    .describe('spotify:track:<id> or https://open.spotify.com/track/<id>'),
  deviceId: z
    .string()
    .optional()
    .describe('The ID of the device to queue the track on'),
});

const queueTrackInputSchema = zodToJsonSchema(
  queueTrackInputZodSchema,
) as Record<string, unknown>;

/**
 * Register tool
 *
 * name: list_devices
 */

mcpServer.registerTool(
  'list_devices',
  {
    title: 'List devices',
    description: 'List all devices connected to the Spotify account',
  },
  async (context: any) => {
    const accessToken = getAccessToken(context);
    const spotify = await getSpotifyClient(accessToken);
    const devices = await spotify.player.getAvailableDevices();
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(devices, null, 2) },
      ],
    };
  },
);

/**
 * Register tool
 *
 * name: search_song
 * description: Search for a song on Spotify
 * parameters:
 *  - type: object
 *    properties:
 *      query:
 *        type: string
 */
type SearchToolInput = z.infer<typeof searchInputZodSchema>;

mcpServer.registerTool(
  'search',
  {
    title: 'search',
    description: 'Search tracks, artists or albums on Spotify',
    inputSchema: searchInputSchema,
  },
  async ({ query, type = 'track' }: SearchToolInput, context: any) => {
    try {
      const accessToken = getAccessToken(context);
      const spotify = await getSpotifyClient(accessToken);
      const result = await spotify.search(query, [type]);
      const minimalResult = result.tracks?.items.map((track: Track) => ({
        name: track.name,
        artist: track.artists[0].name,
        album: track.album.name,
        uri: track.uri,
      }));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(minimalResult, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to search Spotify');
    }
  },
);

/**
 * Register tool
 *
 * name: queue_song
 * description: Queue a song on Spotify
 * parameters:
 *  - type: object
 *    properties:
 *      uri:
 *        type: string
 *      device_id:
 *        type: string
 */

type QueueTrackInput = z.infer<typeof queueTrackInputZodSchema>;

mcpServer.registerTool(
  'queue_track',
  {
    title: 'Queue Track',
    description: "Add a track URI to the user's playback queue",
    inputSchema: queueTrackInputSchema,
  },
  async ({ uri, deviceId }: QueueTrackInput, context: any) => {
    try {
      const accessToken = getAccessToken(context);
      const spotify = await getSpotifyClient(accessToken);

      await spotify.player.addItemToPlaybackQueue(uri, deviceId); // may 403 if token lacks scope
      return {
        content: [{ type: 'text', text: `Queued ${uri}` }],
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to queue track');
    }
  },
);

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

/* Client → Server (JSON-RPC over HTTP POST) */
app.post('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? randomUUID();
  res.setHeader('Mcp-Session-Id', sessionId);
  const transport = ensureTransport(sessionId);
  await transport.handleRequest(req, res, req.body);
});

/* Server → Client notifications (SSE via HTTP GET) */
app.get('/mcp', async (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string) ?? randomUUID();

  res.setHeader('Mcp-Session-Id', sessionId);

  const transport = ensureTransport(sessionId);
  await transport.handleRequest(req, res);
});

/* Cleanup */
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].close();
  }
  res.sendStatus(204);
});

/**************************************************
 * API
 **************************************************/

/**
 * Health check endpoint
 *
 * GET /
 *
 * Response:
 *  - 200 OK
 *  - body:
 *    - sessions: number
 *    - tools: object
 */
function getActiveSessions() {
  return Object.keys(transports).length;
}

app.get('/', (req, res) => {
  const activeSessions = getActiveSessions();

  res.json({
    message: 'MCP Server Running',
    endpoint: '/mcp',
    sessions: activeSessions,
  });
});

app.get('/lyrics', async (req, res) => {
  try {
    const genius = new GeniusClient();
    const song = await genius.songs.search(req.query.searchTerm as string);
    const lyrics = await song?.[0].lyrics();
    res.send(lyrics);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to get lyrics');
  }
});

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
  console.log(`[ ready ] http://${host}:${port}`);
});
