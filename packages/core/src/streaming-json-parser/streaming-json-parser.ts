import { s } from '../schema';

import Ajv, { JTDParser } from 'ajv/dist/jtd';
import { parseJSON } from './parser';

// TODO: need to detect if schema is JSON Schema or JTD (which allows for custom parser)

export class StreamSchemaParser {
  ajv = new Ajv();

  dataString = '';

  schema: s.AnyType;
  docParser: JTDParser;

  constructor(schema: s.AnyType, streamingPathsWithTypes: string[]) {
    this.schema = schema;
    this.docParser = this.ajv.compileParser(s.toJsonTypeDefinition(schema));

    console.log(streamingPathsWithTypes);
  }

  parse(item: string) {
    this.dataString += item;

    // TODO: What to pass in? Streaming isn't in main yet...
    // so I can use the same things I was going to before...
    /*
      For now, tree anything not explicitly marked as streaming as streaming.

      Use the information path info I'm already passing in.

      Work it down into the parseObj function and judge by key path.

      Remove the other Allow stuff, I guess.
    */
    const currResult = parseJSON(this.dataString, Allow.ALL);

    console.log(currResult);

    return currResult;
  }
}

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  schema: s.ObjectType<Record<string, s.AnyType>>,
  streamingPaths: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncIterableIterator<any> {
  const streamParser = new StreamSchemaParser(schema, streamingPaths);

  for await (const item of iterable) {
    const doc = streamParser.parse(item);

    yield doc;
  }
}
