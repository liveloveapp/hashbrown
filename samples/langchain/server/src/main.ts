import cors from 'cors';
import express from 'express';

import { chatRouter } from './routes/chat.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use('/', chatRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`☁️  Agent server listening on http://localhost:${port}`);
});
