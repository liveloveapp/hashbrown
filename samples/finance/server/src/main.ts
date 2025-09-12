import express from 'express';
import { createApi } from './app';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const api = createApi();
const app = express();

// Mount under root (routes are already /api/*)
app.use(api);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

export default app;
