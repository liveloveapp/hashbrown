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

  const responseSchema = s.object('root', {
    glossary: s.object('glossary', {
      title: s.string('glossary.title'),
      GlossDiv: s.object('GlossDiv', {
        title: s.string('GlossDiv.title'),
        GlossList: s.streaming.array(
          'GlossDiv.GlossList',
          s.object('', {
            ID: s.string('GlossList.ID'),
            SortAs: s.string('GlossList.SortAs'),
            GlossTerm: s.string('GlossList.GlossTerm'),
            Acronym: s.string('GlossList.Acronym'),
            GlossDef: s.object('GlossList.GlossDef', {
              para: s.string('GlossDef.para'),
              GlossSeeAlso: s.array('GlossDef.GlossSeeAlso', s.string('')),
            }),
            GlossSee: s.string('GlossList.GlossSee'),
            ExampleSentences: s.streaming.array(
              'GlossList.ExampleSentences',
              s.string('ExampleSentence'),
            ),
          }),
        ),
        SynonymList: s.streaming.array(
          'GlossDiv.SynonymList',
          s.object('Synonym', {
            ID: s.string('Synonym.ID'),
            GlossTerm: s.string('Synonym.GlossTerm'),
            Acronym: s.string('Synonym.Acronym'),
            SynonymDef: s.object('Synonym.SynonymDef', {
              word: s.string('Synonym.word'),
              meaning: s.string('SynonymDef.meaning'),
            }),
          }),
        ),
      }),
    }),
  });

  const iterable = new SocketAsyncIterable(client);

  const parserIterable = AsyncParserIterable(iterable, responseSchema);

  try {
    for await (const data of parserIterable) {
      console.log('Received data:');
      console.log(JSON.stringify(data, null, 4));
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
