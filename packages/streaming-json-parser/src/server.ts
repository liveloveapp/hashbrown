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
  // TODO: add more json, break it into pieces and send small (perhaps varyingly sized chunks)
  socket.write(`${JSON.stringify(TEST_JSON)}\r\n`);
  socket.pipe(socket);
});

server.listen(1337, '127.0.0.1');
