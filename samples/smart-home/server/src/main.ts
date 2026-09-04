import { createApi } from './app';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-nano';
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

const app = createApi({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
  model: OPENAI_MODEL,
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
