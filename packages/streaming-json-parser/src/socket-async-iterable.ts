import { Socket } from 'net';

export class SocketAsyncIterable {
  socket: Socket;
  buffer: any;
  isDone: boolean;
  pending: any[];
  error: any;

  constructor(socket: Socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.isDone = false;
    this.pending = [];
    this.socket.on('data', (data: any) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.dispatch();
    });
    this.socket.on('end', () => {
      this.isDone = true;
      this.dispatch();
    });
    this.socket.on('error', (err) => {
      this.isDone = true;
      this.error = err;
      this.dispatch();
    });
  }

  dispatch() {
    if (this.pending.length > 0) {
      if (this.buffer.length > 0) {
        const resolve = this.pending.shift();
        const data = this.buffer.toString();
        this.buffer = Buffer.alloc(0);
        resolve({ value: data, done: false });
      } else if (this.isDone) {
        const resolve = this.pending.shift();
        resolve({ value: undefined, done: true });
      } else if (this.error) {
        const reject = this.pending.shift();
        reject(this.error);
      }
    }
  }

  next(): Promise<{ value: any; done: boolean }> {
    return new Promise((resolve, reject) => {
      this.pending.push(resolve);
      this.dispatch();
    });
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
