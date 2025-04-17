// Custom parsing example from Gemini:
import { Readable } from 'stream';

async function findSchemaCustom(stream: Readable): Promise<any> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk);
    const schemaMatch = buffer.match(
      /"definitions":\s*\{.*?"schema":\s*(\{.*?\})\s*}/,
    );

    if (schemaMatch) {
      try {
        return JSON.parse(schemaMatch[1]);
      } catch (e) {
        throw new Error('Error parsing schema: ' + e);
      }
    }
  }
  throw new Error('Schema not found');
}

const byteStream2 = Readable.from(
  JSON.stringify({
    definitions: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      },
      other: 'value',
    },
    data: [],
  }),
);

findSchemaCustom(byteStream2)
  .then((schema) => {
    console.log('Found schema:', schema);
  })
  .catch((error) => {
    console.error('Error finding schema:', error);
  });
