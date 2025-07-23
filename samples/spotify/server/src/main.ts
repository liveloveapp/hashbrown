/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express from 'express';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 5150;

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: '30mb',
  }),
);

/**************************************************
 * MCP Server
 **************************************************/

/**
 * Register tool
 *
 * name: list_devices
 */

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
app.get('/', (req, res) => {
  res.send({ message: 'Hello API' });
});

/**
 * Auth callback endpoint
 *
 * GET /callback
 */

/**
 * Lyrics
 *
 * GET /lyrics
 *
 * Response:
 *  - 200 OK
 *  - body:
 *    - lyrics: string
 *
 */

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
