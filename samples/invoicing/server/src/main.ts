import { createServer } from 'node:http';
import { createInvoicingListener } from './http';
import { createSessionStore } from './session-store';

const server = createServer(createInvoicingListener(createSessionStore()));
server.listen(4325, '127.0.0.1', () => {
  console.log('Invoicing snapshot server: http://127.0.0.1:4325');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    server.closeIdleConnections();
  });
}
