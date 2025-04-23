import { s } from '../schema';

import Ajv, { JTDParser } from 'ajv/dist/jtd';

// TODO: need to detect if schema is JSON Schema or JTD (which allows for custom parser)

/*
  TODO:
  Need to detect and stream the streaming bits of the schema

  Since I need to:
  - return the full doc at the end
  - return update to streaming elements after each chunk is parsed
  - may have multiple streams
  - may have nested elements

  I need to create a doc skeleton, and scaffold out containers for
  the streaming bits.  Then, I can return partial objects with 
  the streamed elements in them.
  
  That would end up being a partial, though, which could be weird

  Really, the JSON will arrive in chunks, but in order.  So I might have a series of nested 
  streaming objects, but not things streaming parallel, right?

  So, you'd be getting part of the whole, come across the beginning of a streaming object, 
  then come upon the beginning of a nested streaming object.  But that would end before the parent, 
  and both would end before the whole doc.

  So, what then?

  Mike suggested a doc skeleton, so I could do that.

  
*/

export class StreamSchemaParser {
  ajv = new Ajv();

  dataString = '';
  lastChunkOffset = 0;

  // Track the close index of matches so we can avoid checking any open/close indices before it
  lastMatchedCloseIndex = 0;
  openBracketIndices: number[] = [];
  closeBracketIndices: number[] = [];

  schema: s.AnyType;
  compiledParser: JTDParser;
  matches: any[] = [];

  constructor(schema: s.AnyType) {
    this.schema = schema;
    this.compiledParser = this.ajv.compileParser(
      s.toJsonTypeDefinition(schema),
    );
  }

  parse(item: string) {
    this.dataString += item;

    // In new string chunk, find brackets to delineate search areas
    for (let i = 0; i < item.length; i++) {
      if (item[i] === '{') {
        this.openBracketIndices.push(this.lastChunkOffset + i);
      } else if (item[i] === '}') {
        this.closeBracketIndices.push(this.lastChunkOffset + i);
      }
    }

    for (let j = 0; j < this.openBracketIndices.length; j++) {
      // If we know we've matched past this point, go ahead and skip it
      if (
        this.lastMatchedCloseIndex !== 0 &&
        this.openBracketIndices[j] < this.lastMatchedCloseIndex
      ) {
        continue;
      }

      for (let k = 0; k < this.closeBracketIndices.length; k++) {
        const openIndex = this.openBracketIndices[j];
        const closeIndex = this.closeBracketIndices[k];

        // If we know we've matched past this point, go ahead and skip it
        if (closeIndex <= this.lastMatchedCloseIndex) {
          continue;
        }

        if (closeIndex < openIndex) {
          continue;
        }

        // Test with ajv against schema
        const data = this.compiledParser(
          this.dataString.substring(openIndex, closeIndex + 1),
        );

        if (data === undefined) {
          // data didn't parse
        } else {
          // Found a match
          this.lastMatchedCloseIndex = closeIndex;

          // Add to match list
          this.matches.push(data);
        }
      }
    }

    this.lastChunkOffset += item.length;

    // Always return all matches so reactive things will behave correctly
    return this.matches;
  }
}

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  schema: s.ObjectType<Record<string, s.AnyType>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncIterableIterator<any> {
  const streamParser = new StreamSchemaParser(schema);

  for await (const item of iterable) {
    const match = streamParser.parse(item);

    if (match != null) {
      yield match;
    }
  }
}
