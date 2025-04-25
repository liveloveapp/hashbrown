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

  // Streaming targets:
  // responseSchema.glossary.GlossDiv.GlossList
  // responseSchema.glossary.GlossDiv.GlossList.(object).ExampleSentences // nested in GlossList
  // responseSchema.glossary.GlossDiv.SynonymList

  const responseSchema = s.object('', {
    glossary: s.object('', {
      title: s.string(''),
      GlossDiv: s.object('', {
        title: s.string(''),
        GlossList: s.array(
          '',
          s.object('', {
            ID: s.string(''),
            SortAs: s.string(''),
            GlossTerm: s.string(''),
            Acronym: s.string(''),
            GlossDef: s.object('', {
              para: s.string(''),
              GlossSeeAlso: s.array('', s.string('')),
            }),
            GlossSee: s.string(''),
            ExampleSentences: s.array('', s.string('')),
          }),
        ),
        SynonymList: s.array(
          '',
          s.object('', {
            ID: s.string(''),
            GlossTerm: s.string(''),
            Acronym: s.string(''),
            SynonymDef: s.object('', {
              word: s.string(''),
              meaning: s.string(''),
            }),
          }),
        ),
      }),
    }),
  });

  const iterable = new SocketAsyncIterable(client);

  // TODO: pass in schema sections for each streamable - I'll need to figure
  // out how to change 's' to reveal that information
  const parserIterable = AsyncParserIterable(iterable, responseSchema, [
    'glossary.GlossDiv.GlossList',
    'glossary.GlossDiv.GlossList.(object).ExampleSentences',
    'glossary.GlossDiv.SynonymList',
  ]);

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
