export function parse(data: string) {
  return JSON.parse(data);
}

/* 
TODO:
- build parser
  - "find chunks of 'schema' in a stream of bytes that will be a whole JSON document
    - custom parsing via bytes and textdecoder (see example below)
    - investigate https://github.com/dominictarr/JSONStream (archived in 2018)
      - mine for ideas and for to implement an event emitter in pipe()
  - should take a schema as an input
    - should validate schema on 'start up'
      - can the schema have loops?
      - 
- build stream event handler
  - when a chunk matching a schema is found, let consumer know
- figure out how to interact with streams from other sources (i.e. open AI completion streams)
  - TransformStream to wrap a returned stream?
*/

/*
Custom parsing example from Gemini:
import { Readable } from 'stream';

async function findSchemaCustom(stream: Readable): Promise<any> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk);
    const schemaMatch = buffer.match(/"definitions":\s*\{.*?"schema":\s*(\{.*?\})\s*}/);

    if (schemaMatch) {
      try {
        return JSON.parse(schemaMatch[1]);
      } catch (e) {
        throw new Error("Error parsing schema: " + e);
      }
    }
  }
  throw new Error("Schema not found");
}


const byteStream2 = Readable.from(JSON.stringify({
    "definitions": {
        "schema": {
            "type": "object",
            "properties": {
                "name": { "type": "string" },
                "age": { "type": "number" }
            },
            "required": ["name", "age"]
        },
        "other": "value"
    },
    "data": []
}));

findSchemaCustom(byteStream2)
  .then(schema => {
    console.log('Found schema:', schema);
  })
  .catch(error => {
    console.error('Error finding schema:', error);
  });
*/
