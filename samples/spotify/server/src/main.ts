import express from 'express';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 5150;

const app = express();

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

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
