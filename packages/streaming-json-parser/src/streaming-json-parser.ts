import Ajv from 'ajv';

// TODO: how to convert from any given otherwise-valid schema to ajv's JTD (JSON Type Definition) format?
// -- to allow use of compiled parsers via ajv.compileParser which requires a JTD schema argument

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  // TODO: need better type
  schema: any,
  // TODO: need better return type - could it be T of schema-defined type?
): AsyncIterableIterator<any> {
  const ajv = new Ajv();

  let dataString = '';
  let lastChunkOffset = 0;
  const openBracketIndices: number[] = [];
  const closeBracketIndices: number[] = [];

  const validate = ajv.compile(schema);

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

    // TODO: probably some optimizations possible around not checking
    //       combinations that overlap (especially if matches were found)

    for (let j = 0; j < openBracketIndices.length; j++) {
      // TODO: initialize k based on j's value to avoid extra iterations
      for (let k = 0; k < closeBracketIndices.length; k++) {
        const openIndex = openBracketIndices[j];
        const closeIndex = closeBracketIndices[k];

        if (closeIndex < openIndex) {
          continue;
        }

        let json;

        try {
          json = JSON.parse(dataString.substring(openIndex, closeIndex + 1));
        } catch (e) {
          // console.log('invalid json chunk');
          continue;
        }

        // Test with ajv against schema
        const valid = validate(json);

        if (!valid) {
          // TODO: if no matches found in chunk, keep it in a buffer and use with
          // next chunk
        } else {
          // Found a match
          // console.log(json);

          // TODO: drop chunks up to where we found match since we don't need them anymore

          yield json;
        }
      }
    }

    lastChunkOffset += item.length;
  }
}
