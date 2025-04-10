import { Chat, TextGenerationWithToolsRequest } from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const request = req.body as TextGenerationWithToolsRequest;
  const stream = Chat.text(request);

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
