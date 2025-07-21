/* eslint-disable @typescript-eslint/no-non-null-assertion */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IResponseDeserializer, SpotifyApi } from '@spotify/web-api-ts-sdk';
import { Client as GeniusClient } from 'genius-lyrics';

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

function getAccessToken(context: any) {
  const authHeader: string | string[] | undefined =
    context.requestInfo?.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('Authorization header is required');
  }
  return authHeader.split(' ')[1]!;
}

function getSpotifyClient(accessToken: string) {
  return SpotifyApi.withAccessToken(
    process.env.SPOTIFY_CLIENT_ID!,
    JSON.parse(decodeURIComponent(accessToken)) as any,
    {
      deserializer: new UnhealthyResponseDeserializer(),
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────────
//  MCP server definition
// ────────────────────────────────────────────────────────────────────────────────
const mcp = new McpServer({
  name: 'spotify-toolbox',
  version: '0.1.0',
  description: 'Spotify search & queue tools exposed over MCP (SSE transport).',
});

/* ── Tool A – search ────────────────────────────────────────────────────────── */
mcp.registerTool(
  'search-music',
  {
    title: 'Search Spotify',
    description: 'Search tracks, artists or albums on Spotify',
    inputSchema: {
      query: z.string().describe('Search keywords'),
      type: z.enum(['track', 'artist', 'album']).optional(),
    },
  },
  async ({ query, type = 'track' }, context) => {
    try {
      const accessToken = getAccessToken(context);
      const spotify = getSpotifyClient(accessToken);
      const result = await spotify.search(query, [type]);
      const minimalResult = result.tracks?.items.map((track) => ({
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

/* ── Tool B – queue up ──────────────────────────────────────────────────────── */
mcp.registerTool(
  'queue-track',
  {
    title: 'Queue Track',
    description: "Add a track URI to the user's playback queue",
    inputSchema: {
      uri: z
        .string()
        .describe('spotify:track:<id> or https://open.spotify.com/track/<id>'),
      deviceId: z
        .string()
        .optional()
        .describe('The ID of the device to queue the track on'),
    },
  },
  async ({ uri, deviceId }, context) => {
    try {
      const accessToken = getAccessToken(context);
      const spotify = getSpotifyClient(accessToken);

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

mcp.registerTool(
  'get-playback-state',
  {
    title: 'Get Playback State',
    description: 'Get the current playback state of the user',
  },
  async (context) => {
    const accessToken = getAccessToken(context);
    const spotify = getSpotifyClient(accessToken);
    const state = await spotify.player.getPlaybackState();
    return {
      content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
    };
  },
);

mcp.registerTool(
  'list-devices',
  {
    title: 'List Devices',
    description: 'List the devices of the user',
  },
  async (context) => {
    const accessToken = getAccessToken(context);
    const spotify = getSpotifyClient(accessToken);
    const devices = await spotify.player.getAvailableDevices();
    return {
      content: [{ type: 'text', text: JSON.stringify(devices, null, 2) }],
    };
  },
);

// ────────────────────────────────────────────────────────────────────────────────
//  Streamable HTTP + SSE transport with session management
// ────────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['*'],
  }),
);

const transports: Record<string, StreamableHTTPServerTransport> = {};

function ensureTransport(sessionId: string) {
  if (transports[sessionId]) return transports[sessionId];
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });
  transports[sessionId] = transport;
  // async – never await here or you'll block the first HTTP request
  mcp.connect(transport).catch(console.error);
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

app.get('/callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    res.redirect(`http://localhost:4600/auth?code=${code}`);
  } else {
    res.status(400).send('Code query parameter is missing');
  }
});

app.get('/lyrics', async (req, res) => {
  const genius = new GeniusClient();
  const song = await genius.songs.search(req.query.searchTerm as string);
  const lyrics = await song?.[0].lyrics();
  res.send(lyrics);
});

app.listen(3400, () => console.log(`🔊 MCP SSE server listening on :${3400}`));
