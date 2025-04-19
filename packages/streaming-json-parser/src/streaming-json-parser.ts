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

        let json;

        try {
          json = JSON.parse(dataString.substring(openIndex, closeIndex + 1));
        } catch (e) {
          // console.log('invalid json chunk');
          continue;
        }

        // Test with ajv against schema
        const valid = validate(json);

        if (valid) {
          // Found a match

          lastMatchedCloseIndex = closeIndex;

          yield json;
        }
      }
    }

    lastChunkOffset += item.length;
  }
}
