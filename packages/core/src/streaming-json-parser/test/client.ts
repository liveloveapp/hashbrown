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

  // - change parser to make a dict of discriminator values to schema for objects in element.anyOf
  // -- then, I can find the discriminator as the first field, and figure out what schema to use

  const responseSchema = s.object('root', {
    glossary: s.object('glossary', {
      title: s.string('glossary.title'),
      GlossDiv: s.object('GlossDiv', {
        title: s.string('GlossDiv.title'),
        // GlossList: s.streaming.array(
        //   'GlossDiv.GlossList',
        //   s.object('', {
        //     ID: s.string('GlossList.ID'),
        //     SortAs: s.string('GlossList.SortAs'),
        //     GlossTerm: s.string('GlossList.GlossTerm'),
        //     Acronym: s.string('GlossList.Acronym'),
        //     GlossDef: s.object('GlossList.GlossDef', {
        //       para: s.string('GlossDef.para'),
        //       GlossSeeAlso: s.array('GlossDef.GlossSeeAlso', s.string('')),
        //     }),
        //     GlossSee: s.string('GlossList.GlossSee'),
        //     ExampleSentences: s.streaming.array(
        //       'GlossList.ExampleSentences',
        //       s.string('ExampleSentence'),
        //     ),
        //   }),
        // ),
        // SynonymList: s.streaming.array(
        //   'GlossDiv.SynonymList',
        //   s.object('Synonym', {
        //     ID: s.string('Synonym.ID'),
        //     GlossTerm: s.string('Synonym.GlossTerm'),
        //     Acronym: s.string('Synonym.Acronym'),
        //     SynonymDef: s.object('Synonym.SynonymDef', {
        //       word: s.string('Synonym.word'),
        //       meaning: s.string('SynonymDef.meaning'),
        //     }),
        //   }),
        // ),
        // Assumption is that streaming will not be used, since there is
        // no discriminator between 7th and 8th grade teachers
        // anyOfListWithoutDiscriminator: s.streaming.array(
        //   'GlossDiv.anyOfListWithoutDiscriminator',
        //   s.anyOf('anyOfListWithoutDiscriminator', [
        //     s.object('7th Grade Teacher', {
        //       firstName: s.string('7th.firstName'),
        //       lastName: s.string('7th.lastName'),
        //     }),
        //     s.object('8th Grade Teacher', {
        //       firstName: s.streaming.string('8th.firstName'),
        //       lastName: s.streaming.string('8th.lastName'),
        //     }),
        //   ]),
        // ),
        anyOfListWithDiscriminator: s.streaming.array(
          'GlossDiv.anyOfListDiscriminator',
          s.anyOf('anyOfListWithDiscriminator', [
            // No streaming
            s.object('7th Grade Teacher', {
              __discriminator: s.constString('seventh'),
              firstName: s.string('7th.firstName'),
              lastName: s.string('7th.lastName'),
              birthDate: s.object('7th.birthDate', {
                year: s.string('7th.birthDate.year'),
                month: s.string('7th.birthDate.month'),
                day: s.string('7th.birthDate.day'),
                time: s.object('7th.birthData.time', {
                  hour: s.number('hour'),
                  minute: s.number('minute'),
                }),
              }),
            }),
            // Will stream
            s.object('8th Grade Teacher', {
              __discriminator: s.constString('eighth'),
              firstName: s.streaming.string('8th.firstName'),
              lastName: s.streaming.string('8th.lastName'),
            }),
          ]),
        ),
      }),
    }),
  });

  // TODO: get a schema that's an array at the top level working

  const iterable = new SocketAsyncIterable(client);

  const parserIterable = AsyncParserIterable(iterable, responseSchema);

  try {
    for await (const data of parserIterable) {
      // To see how things are changing in a dynamic way, clear the console before
      // parsing update
      // console.clear();
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
