import { Logger } from '../logger/logger';
import { s } from '../schema';

import { parseJSON } from './parser';

const ENABLE_LOGGING = false;

export class StreamSchemaParser {
  logger: Logger;

  dataString = '';

  schema: s.HashbrownType;

  constructor(schema: s.HashbrownType) {
    this.schema = schema;

    this.logger = new Logger(ENABLE_LOGGING);
  }

  parse(item: string) {
    this.dataString += item;

    const currResult = parseJSON(this.dataString, this.schema);

    this.logger.log(currResult);

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
    const doc = streamParser.parse(item);

    yield doc;
  }
}
