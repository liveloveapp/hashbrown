import { createServer } from 'net';

const TEST_JSON = {
  glossary: {
    title: 'example glossary',
    GlossDiv: {
      title: 'S',
      GlossList: {
        GlossEntry: {
          ID: 'SGML',
          SortAs: 'SGML',
          GlossTerm: 'Standard Generalized Markup Language',
          Acronym: 'SGML',
          Abbrev: 'ISO 8879:1986',
          GlossDef: {
            para: 'A meta-markup language, used to create markup languages such as DocBook.',
            GlossSeeAlso: ['GML', 'XML'],
          },
          GlossSee: 'markup',
        },
      },
    },
  },
};

const server = createServer(function (socket) {
  socket.write(`${JSON.stringify(TEST_JSON)}\r\n`);
  socket.pipe(socket);
});

server.listen(1337, '127.0.0.1');
