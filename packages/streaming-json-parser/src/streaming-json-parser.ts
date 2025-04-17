import { Stream } from 'stream';

export function parse(data: string) {
  return JSON.parse(data);
}

/* 
TODO:
- build parser
  - "find chunks of 'schema' in a stream of bytes that will be a whole JSON document
    - custom parsing via bytes and textdecoder?
    - investigate https://github.com/dominictarr/JSONStream (archived in 2018)
      - mine for ideas and for to implement an event emitter in pipe()
  - should take a schema as an input
    - should validate schema on 'start up'
      - can the schema have loops?
- build stream event handler
  - when a chunk matching a schema is found, let consumer know
*/

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
): AsyncIterableIterator<string> {
  for await (const item of iterable) {
    // TODO: add more complex parsing here
    const parsed = JSON.parse(item);

    yield parsed;
  }
}
