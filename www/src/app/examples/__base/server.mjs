import { HashbrownOpenAI } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

const host = process.env['HOST'] ?? '0.0.0.0';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;

const app = express();
app.use(express.json());
app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const request = req.body;
  const hashbrownHeader = req.headers['x-hashbrown'];

  if (!hashbrownHeader) {
    return res.status(400).send('Missing x-hashbrown header');
  }

  let config = {};
  try {
    config = JSON.parse(hashbrownHeader);
  } catch (error) {
    return res.status(400).send('Invalid x-hashbrown header format');
  }

  if (!config.provider) {
    return res.status(400).send('Missing provider in x-hashbrown header');
  }
  if (!config.apiKey) {
    return res.status(400).send('Missing apiKey in x-hashbrown header');
  }

  let stream;
  switch (config.provider) {
    case 'openai':
      stream = HashbrownOpenAI.stream.text(config.apiKey, request);
      break;
    default:
      return res.status(400).send('Unsupported provider in x-hashbrown header');
  }

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});

app.get('/', async (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>hashbrown</title>
        <base href="/" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div>Loading...</div>
      </body>
    </html>
  `);
});
