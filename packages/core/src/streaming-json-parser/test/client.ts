import { Socket } from 'net';
import { AsyncParserIterable } from '../streaming-json-parser';
import { SocketAsyncIterable } from './socket-async-iterable';

import { s } from '../../schema';
import { toJsonSchema } from '../../schema/to-json-schema';
import { PRIMITIVE_WRAPPER_FIELD_NAME } from '../../schema/base';

(async () => {
  console.log('Connecting...');
  const client = new Socket();

  client.connect(1337, '127.0.0.1', function () {
    console.log('Connected');
  });

  // anyOf as a property (instead of in a container)
  const responseSchema = s.object('root', {
    ui: s.streaming.array(
      'list of elements',
      s.anyOf([
        s.object('Show markdown to the user', {
          $tagName: s.literal('app-markdown'),
          $props: s.object('Props', {
            data: s.streaming.string('The markdown content'),
          }),
        }),
        s.object('Show a button to the user', {
          $tagName: s.literal('app-button'),
          $props: s.object('Props', {
            data: s.streaming.string('The button content'),
          }),
        }),
      ]),
    ),
  });

  // const responseSchema = s.streaming.array(
  //   'root array',
  //   s.object('root object', {
  //     glossary: s.object('glossary', {
  //       title: s.string('glossary.title'),
  //       GlossDiv: s.object('GlossDiv', {
  //         title: s.string('GlossDiv.title'),
  //         GlossList: s.streaming.array(
  //           'GlossDiv.GlossList',
  //           s.object('', {
  //             ID: s.string('GlossList.ID'),
  //             SortAs: s.string('GlossList.SortAs'),
  //             GlossTerm: s.string('GlossList.GlossTerm'),
  //             Acronym: s.string('GlossList.Acronym'),
  //             GlossDef: s.object('GlossList.GlossDef', {
  //               para: s.string('GlossDef.para'),
  //               GlossSeeAlso: s.array('GlossDef.GlossSeeAlso', s.string('')),
  //             }),
  //             GlossSee: s.string('GlossList.GlossSee'),
  //             ExampleSentences: s.streaming.array(
  //               'GlossList.ExampleSentences',
  //               s.string('ExampleSentence'),
  //             ),
  //           }),
  //         ),
  //         SynonymList: s.streaming.array(
  //           'GlossDiv.SynonymList',
  //           s.object('Synonym', {
  //             ID: s.string('Synonym.ID'),
  //             GlossTerm: s.string('Synonym.GlossTerm'),
  //             Acronym: s.string('Synonym.Acronym'),
  //             SynonymDef: s.object('Synonym.SynonymDef', {
  //               word: s.string('Synonym.word'),
  //               meaning: s.string('SynonymDef.meaning'),
  //             }),
  //           }),
  //         ),
  //         anyOfListWithDiscriminator: s.streaming.array(
  //           'GlossDiv.anyOfListDiscriminator',
  //           s.anyOf([
  //             // No streaming
  //             s.object('7th Grade Teacher', {
  //               // Expectation: this will be moved to end of properties list
  //               birthDate: s.streaming.object('7th.birthDate', {
  //                 // Expectation: property order won't change, but incremental updates
  //                 // will occur
  //                 year: s.string('7th.birthDate.year'),
  //                 month: s.string('7th.birthDate.month'),
  //                 day: s.string('7th.birthDate.day'),
  //                 time: s.object('7th.birthData.time', {
  //                   hour: s.number('hour'),
  //                   minute: s.number('minute'),
  //                 }),
  //               }),
  //               firstName: s.string('7th.firstName'),
  //               lastName: s.string('7th.lastName'),
  //             }),
  //             // Will stream
  //             s.object('8th Grade Teacher', {
  //               firstName: s.streaming.string('8th.firstName'),
  //               lastName: s.streaming.string('8th.lastName'),
  //             }),
  //           ]),
  //         ),
  //       }),
  //     }),
  //   }),
  // );

  const iterable = new SocketAsyncIterable(client);

  const parserIterable = AsyncParserIterable(iterable, responseSchema);

  try {
    for await (const data of parserIterable) {
      // To see how things are changing in a dynamic way, clear the console before
      // parsing update
      // console.clear();
      console.log('new chunk');
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
