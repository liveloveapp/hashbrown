import { Socket } from 'net';
import { AsyncParserIterable } from '../streaming-json-parser';
import { SocketAsyncIterable } from './socket-async-iterable';

import { s } from '../../schema';

(async () => {
  console.log('Connecting...');
  const client = new Socket();

  client.connect(1337, '127.0.0.1', function () {
    console.log('Connected');
  });

  /* Sample target
  
    GlossDef: {
      para: 'A meta-markup language, used to create markup languages such as DocBook.',
      GlossSeeAlso: ['GML', 'XML'],
    }, 
  */

  const pattyCakerSchema = s.object('', {
    para: s.string(''),
    GlossSeeAlso: s.array('', s.string('')),
  });

  const iterable = new SocketAsyncIterable(client);
  const parserIterable = AsyncParserIterable(iterable, pattyCakerSchema);
  try {
    for await (const data of parserIterable) {
      console.log('Received data:', data);
    }
    console.log('Socket ended.');
  } catch (err) {
    console.error('Socket error:', err);
  }

  client.on('close', function () {
    console.log('Connection closed');
  });
})()
  .then(() => console.log('in then'))
  .catch((err) => console.log('Fatal error', err));
