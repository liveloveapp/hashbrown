import express from 'express';
import { createApi } from './app';
import cors from 'cors';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const api = createApi();
const app = express();

app.use(cors());

// Mount under root (routes are already /api/*)
app.use(api);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

export default app;
