// import Ajv from 'ajv';

import { s } from '../schema';

import Ajv from 'ajv/dist/jtd';

// TODO: need to detect if schema is JSON Schema or JTD (which allows for custom parser)

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  // TODO: need better type

  schema: s.ObjectType<any>,
  // TODO: need better return type - could it be T of schema-defined type?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncIterableIterator<any> {
  const ajv = new Ajv();

  let dataString = '';
  let lastChunkOffset = 0;
  const openBracketIndices: number[] = [];
  const closeBracketIndices: number[] = [];

  console.log(s.toJsonTypeDefinition(schema));

  const customParser = ajv.compileParser(s.toJsonTypeDefinition(schema));

  // Track the close index of matches so we can avoid checking any open/close indices before it
  let lastMatchedCloseIndex = 0;

  for await (const item of iterable) {
    // Add item to rest of data
    dataString += item;

    // In new string chunk, find brackets to delineate search areas
    for (let i = 0; i < item.length; i++) {
      if (item[i] === '{') {
        openBracketIndices.push(lastChunkOffset + i);
      } else if (item[i] === '}') {
        closeBracketIndices.push(lastChunkOffset + i);
      }
    }

    for (let j = 0; j < openBracketIndices.length; j++) {
      // If we know we've matched past this point, go ahead and skip it
      if (
        lastMatchedCloseIndex !== 0 &&
        openBracketIndices[j] < lastMatchedCloseIndex
      ) {
        continue;
      }

      for (let k = 0; k < closeBracketIndices.length; k++) {
        const openIndex = openBracketIndices[j];
        const closeIndex = closeBracketIndices[k];

        // If we know we've matched past this point, go ahead and skip it
        if (closeIndex <= lastMatchedCloseIndex) {
          continue;
        }

        if (closeIndex < openIndex) {
          continue;
        }

        // Test with ajv against schema
        const data = customParser(
          dataString.substring(openIndex, closeIndex + 1),
        );

        if (data === undefined) {
          // data didn't parse
        } else {
          // Found a match
          lastMatchedCloseIndex = closeIndex;
          yield data;
        }
      }
    }

    lastChunkOffset += item.length;
  }
}
