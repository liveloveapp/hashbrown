import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { HashbrownOpenAI } from '@hashbrownai/openai';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.use(
  express.json({
    limit: '30mb',
  }),
);
app.use(cors());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

app.get('/', (req, res) => {
  res.send({ message: 'Hello API' });
});

app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: OPENAI_API_KEY,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        reasoning_effort: 'minimal',
      };
    },
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
