// import Ajv from 'ajv/dist/jtd';
import Ajv from 'ajv';

type Chunk = {
  data: string;
  openBracketIndices: number[];
  closeBracketIndices: number[];
};

// TODO: how to convert from any given otherwise-valid schema to ajv's JTD (JSON Type Definition) format?
// -- to allow use of compiled parsers via ajv.compileParser which requires a JTD schema argument

// TODO: define "max chunks" and treat length like a circular buffer
type Chunks = Chunk[];

export async function* AsyncParserIterable(
  iterable: AsyncIterable<string>,
  // TODO: need better type
  schema: any,
  // TODO: need better return type - could it be T of schema-defined type?
): AsyncIterableIterator<any> {
  const ajv = new Ajv();

  // Initialize chunk storage
  const chunks: Chunks = [];

  const validate = ajv.compile(schema);

  for await (const item of iterable) {
    console.log(item);

    chunks.push({
      data: item,
      openBracketIndices: [],
      closeBracketIndices: [],
    });

    // Find brackets to delineate search areas
    for (let i = 0; i < item.length; i++) {
      if (item[i] === '{') {
        chunks.at(-1)?.openBracketIndices.push(i);
      } else if (item[i] === '}') {
        chunks.at(-1)?.closeBracketIndices.push(i);
      }
    }

    console.log(chunks);

    // TODO: probably some optimizations possible around not checking
    // TODO: combinations that overlap (especially if matches were found)
    // Determine combinations of open/close brackets
    // TODO: check across chunks
    const openBracketIndicesLength =
      chunks.at(-1)?.openBracketIndices.length ?? 0;
    const closeBracketIndicesLength =
      chunks.at(-1)?.closeBracketIndices.length ?? 0;

    for (let j = 0; j < openBracketIndicesLength; j++) {
      // TODO: initialize k based on j's value to avoid extra iterations
      for (let k = 0; k < closeBracketIndicesLength; k++) {
        const openIndex = chunks[chunks.length - 1].openBracketIndices[j];
        const closeIndex = chunks[chunks.length - 1].closeBracketIndices[k];

        // console.log(`o: ${openIndex}, c: ${closeIndex}`);

        if (closeIndex < openIndex) {
          continue;
        }

        // console.log(
        //   `Substr: ${chunks[chunks.length - 1].data.substring(openIndex, closeIndex + 1)}`,
        // );

        let json;

        try {
          json = JSON.parse(
            chunks[chunks.length - 1].data.substring(openIndex, closeIndex + 1),
          );
        } catch (e) {
          // console.log('invalid json chunk');
          continue;
        }

        // Test with ajv against schema
        const valid = validate(json);

        if (!valid) {
          // console.log(
          //   `Substr: ${chunks[chunks.length - 1].data.substring(openIndex, closeIndex + 1)}`,
          // );
          // console.log(validate.errors); // error message from the last parse call
          // no match, so keep going
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
  }
}
