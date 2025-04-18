import { createServer } from 'net';

const TEST_JSON = {
  glossary: {
    title: 'example glossary',
    GlossDiv: {
      title: 'S',
      GlossList: [
        {
          ID: 'SGML',
          SortAs: 'SGML',
          GlossTerm: 'Standard Generalized Markup Language',
          Acronym: 'SGML',
          GlossDef: {
            para: 'A meta-markup language, used to create markup languages such as DocBook.',
            GlossSeeAlso: ['GML', 'XML'],
          },
          GlossSee: 'markup',
        },
        {
          ID: 'XML',
          SortAs: 'XML',
          GlossTerm: 'X Markup Language',
          Acronym: 'XML',
          GlossDef: {
            para: 'A markup language, used to create markup languages such as SOAP.',
            GlossSeeAlso: ['GML', 'XML'],
          },
          GlossSee: 'markup',
        },
        {
          ID: 'HTML',
          SortAs: 'HTML',
          GlossTerm: 'Hypertext Markup Language',
          Acronym: 'HTML',
          GlossDef: {
            para: 'A markup language, used to create web pages.',
            GlossSeeAlso: ['XML', 'XHTML'],
          },
          GlossSee: 'markup',
        },
      ],
    },
  },
};

const server = createServer(function (socket) {
  const TEST_STRING = JSON.stringify(TEST_JSON);

  console.log(`Test string length: ${TEST_STRING.length}`);

  const MAX_SIZE = 20;
  const MIN_SIZE = 10;

  let cursor = 0;

  while (cursor < TEST_STRING.length) {
    const chunkLength =
      Math.floor(Math.random() * (MAX_SIZE - MIN_SIZE + 1)) + MIN_SIZE;

    console.log(`Cursor: ${cursor}`);
    console.log(`Chunk Length: ${chunkLength}`);
    const chunk = TEST_STRING.slice(cursor, cursor + chunkLength);

    console.log(`Chunk: ${chunk}`);

    socket.write(chunk);

    cursor += chunkLength;
  }

  socket.pipe(socket);
});

server.listen(1337, '127.0.0.1');
