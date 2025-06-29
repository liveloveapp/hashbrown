import { createServer } from 'net';
import { PRIMITIVE_WRAPPER_FIELD_NAME } from '../../schema/base';

const TEST_JSON = {
  // element: {
  //   1: {
  //     data: 'the markdown data',
  //   },
  // },
  element: false,
};

// const TEST_JSON = {
//   ui: [
//     {
//       '0': {
//         $tagName: 'app-markdown',
//         $props: { data: 'Hello! How can I assist you today?' },
//       },
//     },
//   ],
// };

// const TEST_JSON = {
//   [PRIMITIVE_WRAPPER_FIELD_NAME]: 7,
// };

// const TEST_JSON = {
//   booleanValue: false,
//   value: 'Example glossary',
//   array: ['string 1', 'string 2'],
//   object: {
//     a: 'make it do what it do',
//     b: 'call the Ghost Busters',
//   },
// };

// const TEST_JSON = [
//   {
//     glossary: {
//       title: 'example glossary',
//       GlossDiv: {
//         title: 'S',
//         GlossList: [
//           {
//             ID: 'SGML',
//             SortAs: 'SGML',
//             GlossTerm: 'Standard Generalized Markup Language',
//             Acronym: 'SGML',
//             GlossDef: {
//               para: 'A meta-markup language, used to create markup languages such as DocBook.',
//               GlossSeeAlso: ['GML', 'XML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'SGML stands for Standard Generalized Markup Language and was developed in the 1980s as a standard for defining markup languages.',
//               'It provides a framework for specifying document structure and content using tags.',
//               'SGML is not itself a markup language but a meta-language used to create other markup languages like HTML and XML.',
//               'One of SGML’s key strengths is its flexibility in defining complex document structures.',
//               'SGML was standardized by ISO as ISO 8879 in 1986.',
//               'It allows authors to define their own tags, enabling highly customizable document formatting.',
//               'SGML is used primarily in large-scale publishing, technical documentation, and archival systems.',
//               'Because of its complexity, SGML has largely been replaced by simpler derivatives like XML for web and software applications.',
//               'Documents in SGML must conform to a Document Type Definition (DTD), which describes their allowable structure.',
//               'Although not as widely used today, SGML laid the groundwork for modern web technologies and markup standards.',
//             ],
//           },
//           {
//             ID: 'XML',
//             SortAs: 'XML',
//             GlossTerm: 'X Markup Language',
//             Acronym: 'XML',
//             GlossDef: {
//               para: 'A markup language, used to create markup languages such as SOAP.',
//               GlossSeeAlso: ['GML', 'XML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'XML stands for eXtensible Markup Language and was developed by the W3C in the late 1990s.',
//               'It is a simplified subset of SGML, designed to be easier to use and more web-friendly.',
//               'XML is a markup language that allows users to define custom tags to structure data.',
//               'It is both human-readable and machine-readable, making it ideal for data exchange between systems.',
//               'Unlike HTML, XML does not have predefined tags; users create their own tags based on the needs of the data.',
//               'XML documents must be well-formed, meaning they follow strict syntax rules such as properly nested tags.',
//               'A Document Type Definition (DTD) or XML Schema can be used to define the structure and rules of an XML document.',
//               'XML is widely used in web services, configuration files, and data interchange formats like RSS and SOAP.',
//               'Although JSON is often preferred today for its simplicity, XML is still prevalent in enterprise and legacy systems.',
//               'XML helped pave the way for structured data on the internet and continues to influence modern data formats.',
//             ],
//           },
//           {
//             ID: 'HTML',
//             SortAs: 'HTML',
//             GlossTerm: 'Hypertext Markup Language',
//             Acronym: 'HTML',
//             GlossDef: {
//               para: 'A markup language, used to create web pages.',
//               GlossSeeAlso: ['XML', 'XHTML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'HTML stands for HyperText Markup Language.',
//               'It is the standard language used to create and design webpages.',
//               'HTML uses elements called tags to structure content.',
//               'Tags are usually written in pairs, like <p> for paragraphs and <h1> for headings.',
//               'HTML documents are saved with a .html or .htm file extension.',
//               'The <html> tag wraps the entire HTML document.',
//               'Web browsers read HTML files to render content visually for users.',
//               'HTML can include text, images, links, videos, and more.',
//               'It works closely with CSS and JavaScript to create interactive and styled webpages.',
//               'HTML5 is the latest version and includes support for multimedia and modern web features.',
//             ],
//           },
//         ],
//         SynonymList: [
//           {
//             ID: 'SGML',
//             GlossTerm: 'Standard Generalized Markup Language',
//             Acronym: 'SGML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'SGML meaning',
//             },
//           },
//           {
//             ID: 'XML',
//             GlossTerm: 'X Markup Language',
//             Acronym: 'XML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'XML meaning',
//             },
//           },
//           {
//             ID: 'HTML',
//             GlossTerm: 'Hypertext Markup Language',
//             Acronym: 'HTML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'HTML meaning',
//             },
//           },
//         ],
//         anyOfListWithDiscriminator: [
//           {
//             firstName: '7th',
//             lastName:
//               'It is a simplified subset of SGML, designed to be easier to use and more web-friendly.',
//             birthDate: {
//               year: '2000',
//               month: 'Feb',
//               day: '26',
//               time: {
//                 hour: 1,
//                 minute: 2,
//               },
//             },
//           },
//           {
//             firstName: '8th',
//             lastName:
//               'XML documents must be well-formed, meaning they follow strict syntax rules such as properly nested tags.',
//           },
//           {
//             firstName: '7th',
//             lastName:
//               'XML helped pave the way for structured data on the internet and continues to influence modern data formats',
//             birthDate: {
//               year: '2000',
//               month: 'Feb',
//               day: '26',
//               time: {
//                 hour: 1,
//                 minute: 2,
//               },
//             },
//           },
//           {
//             firstName: '8th',
//             lastName:
//               'Although not as widely used today, SGML laid the groundwork for modern web technologies and markup standards.',
//           },
//         ],
//       },
//     },
//   },
//   {
//     glossary: {
//       title: 'another example glossary',
//       GlossDiv: {
//         title: 'S',
//         GlossList: [
//           {
//             ID: 'SGML',
//             SortAs: 'SGML',
//             GlossTerm: 'Standard Generalized Markup Language',
//             Acronym: 'SGML',
//             GlossDef: {
//               para: 'A meta-markup language, used to create markup languages such as DocBook.',
//               GlossSeeAlso: ['GML', 'XML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'SGML stands for Standard Generalized Markup Language and was developed in the 1980s as a standard for defining markup languages.',
//               'It provides a framework for specifying document structure and content using tags.',
//               'SGML is not itself a markup language but a meta-language used to create other markup languages like HTML and XML.',
//               'One of SGML’s key strengths is its flexibility in defining complex document structures.',
//               'SGML was standardized by ISO as ISO 8879 in 1986.',
//               'It allows authors to define their own tags, enabling highly customizable document formatting.',
//               'SGML is used primarily in large-scale publishing, technical documentation, and archival systems.',
//               'Because of its complexity, SGML has largely been replaced by simpler derivatives like XML for web and software applications.',
//               'Documents in SGML must conform to a Document Type Definition (DTD), which describes their allowable structure.',
//               'Although not as widely used today, SGML laid the groundwork for modern web technologies and markup standards.',
//             ],
//           },
//           {
//             ID: 'XML',
//             SortAs: 'XML',
//             GlossTerm: 'X Markup Language',
//             Acronym: 'XML',
//             GlossDef: {
//               para: 'A markup language, used to create markup languages such as SOAP.',
//               GlossSeeAlso: ['GML', 'XML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'XML stands for eXtensible Markup Language and was developed by the W3C in the late 1990s.',
//               'It is a simplified subset of SGML, designed to be easier to use and more web-friendly.',
//               'XML is a markup language that allows users to define custom tags to structure data.',
//               'It is both human-readable and machine-readable, making it ideal for data exchange between systems.',
//               'Unlike HTML, XML does not have predefined tags; users create their own tags based on the needs of the data.',
//               'XML documents must be well-formed, meaning they follow strict syntax rules such as properly nested tags.',
//               'A Document Type Definition (DTD) or XML Schema can be used to define the structure and rules of an XML document.',
//               'XML is widely used in web services, configuration files, and data interchange formats like RSS and SOAP.',
//               'Although JSON is often preferred today for its simplicity, XML is still prevalent in enterprise and legacy systems.',
//               'XML helped pave the way for structured data on the internet and continues to influence modern data formats.',
//             ],
//           },
//           {
//             ID: 'HTML',
//             SortAs: 'HTML',
//             GlossTerm: 'Hypertext Markup Language',
//             Acronym: 'HTML',
//             GlossDef: {
//               para: 'A markup language, used to create web pages.',
//               GlossSeeAlso: ['XML', 'XHTML'],
//             },
//             GlossSee: 'markup',
//             ExampleSentences: [
//               'HTML stands for HyperText Markup Language.',
//               'It is the standard language used to create and design webpages.',
//               'HTML uses elements called tags to structure content.',
//               'Tags are usually written in pairs, like <p> for paragraphs and <h1> for headings.',
//               'HTML documents are saved with a .html or .htm file extension.',
//               'The <html> tag wraps the entire HTML document.',
//               'Web browsers read HTML files to render content visually for users.',
//               'HTML can include text, images, links, videos, and more.',
//               'It works closely with CSS and JavaScript to create interactive and styled webpages.',
//               'HTML5 is the latest version and includes support for multimedia and modern web features.',
//             ],
//           },
//         ],
//         SynonymList: [
//           {
//             ID: 'SGML',
//             GlossTerm: 'Standard Generalized Markup Language',
//             Acronym: 'SGML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'SGML meaning',
//             },
//           },
//           {
//             ID: 'XML',
//             GlossTerm: 'X Markup Language',
//             Acronym: 'XML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'XML meaning',
//             },
//           },
//           {
//             ID: 'HTML',
//             GlossTerm: 'Hypertext Markup Language',
//             Acronym: 'HTML',
//             SynonymDef: {
//               word: 'A markup language, used to create web pages.',
//               meaning: 'HTML meaning',
//             },
//           },
//         ],
//         anyOfListWithDiscriminator: [
//           {
//             firstName: '7th',
//             lastName:
//               'It is a simplified subset of SGML, designed to be easier to use and more web-friendly.',
//             birthDate: {
//               year: '2000',
//               month: 'Feb',
//               day: '26',
//               time: {
//                 hour: 1,
//                 minute: 2,
//               },
//             },
//           },
//           {
//             firstName: '8th',
//             lastName:
//               'XML documents must be well-formed, meaning they follow strict syntax rules such as properly nested tags.',
//           },
//           {
//             firstName: '7th',
//             lastName:
//               'XML helped pave the way for structured data on the internet and continues to influence modern data formats',
//             birthDate: {
//               year: '2000',
//               month: 'Feb',
//               day: '26',
//               time: {
//                 hour: 1,
//                 minute: 2,
//               },
//             },
//           },
//           {
//             firstName: '8th',
//             lastName:
//               'Although not as widely used today, SGML laid the groundwork for modern web technologies and markup standards.',
//           },
//         ],
//       },
//     },
//   },
// ];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = createServer(async function (socket) {
  const TEST_STRING = JSON.stringify(TEST_JSON) + 'extraextraextra';

  console.log(`Test string length: ${TEST_STRING.length}`);

  const MAX_SIZE = 30;
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

    // Slow down data for demo purposes
    await sleep(100);
  }

  socket.pipe(socket);
});

server.listen(1337, '127.0.0.1');
