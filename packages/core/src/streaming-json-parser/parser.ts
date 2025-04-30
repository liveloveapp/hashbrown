import { s } from '../schema';
import { isStreaming } from '../schema/internal';
import { HashbrownType, internal } from '../schema/internal/base';

class PartialJSON extends Error {}

class MalformedJSON extends Error {}

function parseJSON(jsonString: string, schema: s.HashbrownType): any {
  if (typeof jsonString !== 'string') {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    throw new Error(`${jsonString} is empty`);
  }
  return _parseJSON(jsonString.trim(), schema);
}

const _parseJSON = (jsonString: string, schema: s.HashbrownType) => {
  const length = jsonString.length;
  let index = 0;

  // Track current object/array so we can move up and down the document stack as we go
  const containerStack: s.HashbrownType[] = [schema];

  const markPartialJSON = (msg: string) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };

  const throwMalformedError = (msg: string) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };

  const parseAny: (
    currentKey: string,
    allowsIncomplete: boolean,
    insideArray: boolean,
  ) => any = (currentKey, allowsIncomplete, insideArray) => {
    skipBlank();

    // console.log('Current last container:');
    // console.log(containerStack[containerStack.length - 1]);

    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') return parseStr(allowsIncomplete);
    if (jsonString[index] === '{') {
      // console.log('in parseAny object branch');
      // console.log(
      //   (containerStack[containerStack.length - 1] as any)[internal].definition,
      // );

      // // Find key in current level of document stock, and add to stack
      // if (currentKey !== '') {
      //   const nextContainer = (
      //     containerStack[containerStack.length - 1][internal].definition as any
      //   ).shape[currentKey];

      //   console.log(`Starting new object with key: ${currentKey}`);
      //   console.log(nextContainer);

      //   if (nextContainer == null) {
      //     throwMalformedError(`Key: ${currentKey} not expected in container`);
      //   }

      //   containerStack.push(nextContainer);
      // }

      return parseObj(currentKey, insideArray);
    }
    if (jsonString[index] === '[')
      return parseArr(currentKey, allowsIncomplete);
    if (
      jsonString.substring(index, index + 4) === 'null' ||
      (allowsIncomplete &&
        length - index < 4 &&
        'null'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return null;
    }
    if (
      jsonString.substring(index, index + 4) === 'true' ||
      (allowsIncomplete &&
        length - index < 4 &&
        'true'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return true;
    }
    if (
      jsonString.substring(index, index + 5) === 'false' ||
      (allowsIncomplete &&
        length - index < 5 &&
        'false'.startsWith(jsonString.substring(index)))
    ) {
      index += 5;
      return false;
    }

    return parseNum(allowsIncomplete);
  };

  const parseStr: (allowsIncomplete: boolean) => string = (
    allowsIncomplete,
  ) => {
    const start = index;
    let escape = false;
    index++; // skip initial quote
    while (
      index < length &&
      (jsonString[index] !== '"' || (escape && jsonString[index - 1] === '\\'))
    ) {
      escape = jsonString[index] === '\\' ? !escape : false;
      index++;
    }
    if (jsonString.charAt(index) == '"') {
      try {
        return JSON.parse(
          jsonString.substring(start, ++index - Number(escape)),
        );
      } catch (e) {
        throwMalformedError(String(e));
      }
    } else if (allowsIncomplete) {
      try {
        return JSON.parse(
          jsonString.substring(start, index - Number(escape)) + '"',
        );
      } catch (e) {
        // SyntaxError: Invalid escape sequence
        return JSON.parse(
          jsonString.substring(start, jsonString.lastIndexOf('\\')) + '"',
        );
      }
    }
    markPartialJSON('Unterminated string literal');
  };

  const parseObj = (parentKey: string, insideArray: boolean) => {
    // console.log(`Parsing object with parent: ${parentKey}`);
    index++; // skip initial brace
    skipBlank();
    const obj: Record<string, any> = {};

    let discriminatorValue: string | undefined = undefined;

    // If we are not in an array, find key in current level of document stock, and add to stack
    if (parentKey !== '') {
      // If parentKey is set, we are not in an array, so get the next stack container
      // (arrays handle it differently, so they can do clean up when the array is complete)
      const nextContainer = (
        containerStack[containerStack.length - 1][internal].definition as any
      ).shape[parentKey];

      // console.log(`Starting new object with key: ${parentKey}`);
      // console.log(nextContainer);

      if (nextContainer == null) {
        throwMalformedError(`Key: ${parentKey} not expected in container`);
      }

      containerStack.push(nextContainer);
    } else {
      // If we are in an array, it may be a direct object or an array of objects (if AnyOf)
      // If it's an AnyOf array, check that all objects defined discriminators or we will
      // not be able to continue parsing.

      const currentContainer = containerStack[containerStack.length - 1];
      // Array handling will have pushed the "direct object" already, so in that case we are done.
      // If the next container is an array, we have an AnyOf and need to figure out which schema to
      // reference (if we, in fact, can)
      if (Array.isArray(currentContainer)) {
        // An array, so try to find the relevant schema by discriminator
        const allHaveDiscriminators = (currentContainer as any).every(
          (schema: HashbrownType) =>
            s.DISCRIMINATOR in (schema[internal].definition as any).shape,
        );
        // console.log(
        //   `Found discriminators in schema in current container: ${allHaveDiscriminators} `,
        // );
        if (!allHaveDiscriminators) {
          throwMalformedError(`All schemata in AnyOf must have discriminators`);
        }
      }
    }

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) return obj;

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          // console.log(`Handling key: ${key}`);

          if (key === s.DISCRIMINATOR) {
            const value = parseAny(key, false, false);
            // console.log(
            //   `Noting discriminator key of: ${key} and value of: ${value}`,
            // );
            discriminatorValue = value;
            const currentContainer = containerStack[containerStack.length - 1];

            const matchingSchema = (currentContainer as any).filter(
              (schema: HashbrownType) => {
                // console.log('in filter');
                // console.log(
                //   (schema[internal].definition as any).shape[s.DISCRIMINATOR][
                //     internal
                //   ].definition.value,
                // );
                return (
                  (schema[internal].definition as any).shape?.[s.DISCRIMINATOR][
                    internal
                  ].definition.value === discriminatorValue
                );
              },
            );

            // console.log(
            //   `Found matching schema in current container for ${discriminatorValue}: ${!!matchingSchema}`,
            // );

            if (matchingSchema.length > 0) {
              // console.log('Adding schema for discriminator');
              // console.log(matchingSchema);
              containerStack.push(matchingSchema[0]);
              obj[key] = value;
            } else {
              throwMalformedError(
                `No schema found for discriminator: ${discriminatorValue}`,
              );
            }
          } else {
            const currentContainer = containerStack[containerStack.length - 1];

            const currentKeyAllowsIncomplete = s.isStreaming(
              (currentContainer[internal].definition as any).shape[key],
            );

            const value = parseAny(key, currentKeyAllowsIncomplete, false);

            // console.log('Value:');
            // console.log(value);
            obj[key] = value;
          }
        } catch (e) {
          //   console.error(e);
          return obj;
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      //   console.log(e);
      return obj;
    }
    index++; // skip final brace

    // Are we inside an array?  They handle adding/removing stack containers for themselves
    // Unless it's an AnyOf, then go ahead and pop
    if (!insideArray || discriminatorValue) {
      // Done with this container, so pop off stack
      containerStack.pop();
      // const completedContainer = containerStack.pop();
      // console.log(
      //   `Completed container: ${completedContainer?.[internal].definition.description}`,
      // );
    } else {
      // console.log(
      //   'Inside array. Object completed, but keeping container stack',
      // );
    }
    return obj;
  };

  const parseArr = (currentKey: string, allowsIncomplete: boolean) => {
    index++; // skip initial bracket
    // console.log('in parseArr');
    const arr = [];

    // console.log('Array container: ');
    // console.log(
    //   (containerStack[containerStack.length - 1][internal].definition as any)
    //     .shape[currentKey][internal].definition.element,
    // );

    // console.log(
    //   `Is object? ${s.isObjectType(
    //     (containerStack[containerStack.length - 1][internal].definition as any)
    //       .shape[currentKey][internal].definition.element,
    //   )}`,
    // );

    // console.log(
    //   `Is anyOf? ${s.isAnyOfType(
    //     (containerStack[containerStack.length - 1][internal].definition as any)
    //       .shape[currentKey][internal].definition.element,
    //   )}`,
    // );

    let containerNeedsPopping = false;
    let contentsAllowIncomplete = false;

    // If this array is of objects, push the container onto the stack
    if (
      s.isObjectType(
        (containerStack[containerStack.length - 1][internal].definition as any)
          .shape[currentKey][internal].definition.element,
      )
    ) {
      containerStack.push(
        (containerStack[containerStack.length - 1][internal].definition as any)
          .shape[currentKey][internal].definition.element,
      );
      containerNeedsPopping = true;
    } else if (
      s.isAnyOfType(
        (containerStack[containerStack.length - 1][internal].definition as any)
          .shape[currentKey][internal].definition.element,
      )
    ) {
      // console.log('pushing anyOf array to container stack');
      containerStack.push(
        (containerStack[containerStack.length - 1][internal].definition as any)
          .shape[currentKey][internal].definition.element[internal].definition
          .options,
      );
      containerNeedsPopping = true;
    } else {
      // console.log(
      //   (contentsAllowIncomplete = (
      //     containerStack[containerStack.length - 1][internal].definition as any
      //   ).shape[currentKey][internal].definition.element),
      // );
      // It's not an object, so check if it is a streaming primitive
      contentsAllowIncomplete = isStreaming(
        (containerStack[containerStack.length - 1][internal].definition as any)
          .shape[currentKey],
      );

      // console.log(
      //   `Array primitive content allows streaming: ${contentsAllowIncomplete}`,
      // );
    }

    try {
      while (jsonString[index] !== ']') {
        arr.push(parseAny('', contentsAllowIncomplete, true));
        skipBlank();
        if (jsonString[index] === ',') {
          index++; // skip comma
        }
      }
    } catch (e) {
      if (allowsIncomplete) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++; // skip final bracket

    // Array was completed, so put container off if needed
    if (containerNeedsPopping) {
      containerStack.pop();
    }

    return arr;
  };

  const parseNum = (allowsIncomplete: boolean) => {
    if (index === 0) {
      if (jsonString === '-') throwMalformedError("Not sure what '-' is");
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        if (allowsIncomplete)
          try {
            return JSON.parse(
              jsonString.substring(0, jsonString.lastIndexOf('e')),
            );
          } catch (e) {
            console.error(e);
          }
        throwMalformedError(String(e));
      }
    }

    const start = index;

    if (jsonString[index] === '-') index++;
    while (jsonString[index] && ',]}'.indexOf(jsonString[index]) === -1)
      index++;

    if (index == length && !allowsIncomplete)
      markPartialJSON('Unterminated number literal');

    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch (e) {
      if (jsonString.substring(start, index) === '-')
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(
          jsonString.substring(start, jsonString.lastIndexOf('e')),
        );
      } catch (e) {
        throwMalformedError(String(e));
      }
    }
  };

  const skipBlank = () => {
    while (index < length && ' \n\r\t'.includes(jsonString[index])) {
      index++;
    }
  };

  // TODO: what is schema is just an array?
  return parseAny('', true, false);
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
