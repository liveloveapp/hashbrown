import { s } from '../schema';

import { parseJSON } from './parser';
export class StreamSchemaParser {
  dataString = '';

  schema: s.HashbrownType;

  constructor(schema: s.HashbrownType) {
    this.schema = schema;
  }

  parse(item: string, assumeFinishedMessage: boolean) {
    this.dataString += item;

    const currResult = parseJSON(
      this.dataString,
      this.schema,
      assumeFinishedMessage,
    );

    return currResult;
  }
}

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  schema: s.HashbrownType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncIterableIterator<any> {
  const streamParser = new StreamSchemaParser(schema);

  for await (const item of iterable) {
    const doc = streamParser.parse(item, false);

    yield doc;
  }
}
