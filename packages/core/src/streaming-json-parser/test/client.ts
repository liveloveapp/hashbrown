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
  // const responseSchema = s.object('gridArea', {
  //   element: s.anyOf([
  //     s.boolean('a boolean'),
  //     s.object('Markdown', {
  //       data: s.streaming.string('The markdown data'),
  //     }),
  //   ]),
  // });

  const responseSchema = s.object('UI', {
    ui: s.streaming.array(
      'list of elements',
      s.anyOf([
        s.object('Show markdown to the user', {
          $tagName: s.literal('app-markdown'),
          $props: s.object('Props', {
            data: s.streaming.string('The markdown content'),
          }),
        }),
      ]),
    ),
  });

  // const responseSchema = s.number('top-level number');

  const data = {
    gridArea: 'a string',
    element: {
      [1]: {
        data: 'the markdown data',
      },
    },
    // element: false,
    // afterAnyOf: 'a string after the anyOf',
  };

  // const data = {
  //   [PRIMITIVE_WRAPPER_FIELD_NAME]: 7,
  // };

  console.log(JSON.stringify(toJsonSchema(responseSchema), null, 4));

  // console.log('parsed value:');
  const result = responseSchema.parseJsonSchema(data);
  console.log('after parsed value');
  console.log(result);
  // responseSchema.validateJsonSchema(data);

  // console.log(responseSchema.toTypeScript());

  // const responseSchema = s.object('root', {
  //   booleanValue: s.boolean('a boolean'),
  //   value: s.streaming.string('glossary name'),
  //   array: s.streaming.array('array', s.string('array string')),
  //   object: s.streaming.object('object', {
  //     a: s.streaming.string('plan a'),
  //     b: s.streaming.string('plan b'),
  //   }),
  // });

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

/*

  June 3
Continental Breakfast.  7:15am - 9:45am.  Grand Assembly.
Registration. 8:00am - 7:00pm.  Atrium: Event Hub.
Rehearsals/Tech Check. 10:00am - 5:00pm.  Keynote/General Session (Yerba Buena 7&8)
Morning Break. 10:30am - 11:15am.  Grand Assembly.
Lunch. 12:00pm - 1:00pm.  Grand Assembly.
Afternoon Break. 3:00pm - 3:30pm.  Grand Assembly.
Welcome Reception.  4:00pm - 7:00pm.  Grand Assembly.
Community Meetups.  5:30pm - 9:00pm.  Atrium: Event Hub

  June 4
Continental Breakfast.  7:15am - 9:55am.  Grand Assembly.
Registration. 7:00am - 7:00pm.  Atrium: Event Hub.
Rehearsals/Tech Check. 7:45am - 8:45am.  Keynote/General Session (Yerba Buena 7&8)
Morning Break. 10:15am - 11:00am.  Salons 9-15: Expo Hall.
Lunch. 12:00pm - 2:00pm.  Salons 9-15: Expo Hall.
Afternoon Break. 3:00pm - 3:45pm.  Salons 9-15: Expo Hall.
The Toolbit Afterparty. 5:15pm - 7:00pm.  Salons 9-15: Expo Hall.
Community Meetups.  7:00pm - 10:40pm.  Atrium: Event Hub


  June 5
Continental Breakfast.  7:15am - 9:55am.  Grand Assembly.
Registration. 7:00am - 3:00pm.  Atrium: Event Hub.
Rehearsals/Tech Check. 7:45am - 8:45am.  Keynote/General Session (Yerba Buena 7&8)
Morning Break. 10:30am - 11:15am.  Salons 9-15: Expo Hall.
Lunch. 12:00pm - 2:00pm.  Salons 9-15: Expo Hall.
Afternoon Break. 3:00pm - 3:45pm.  Salons 9-15: Expo Hall.
Community Meetups.  5:30pm - 9:00pm.  Atrium: Event Hub


  */
