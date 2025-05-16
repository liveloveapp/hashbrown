import { Logger } from '../logger/logger';
import { s } from '../schema';
import { isStreaming } from '../schema/internal';
import { HashbrownType, internal } from '../schema/internal/base';

const ENABLE_LOGGING = false;

class PartialJSON extends Error {}

class MalformedJSON extends Error {}

class IncompleteNonStreamingObject extends Error {}

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
  const logger = new Logger(ENABLE_LOGGING);

  logger.log('In _parseJson');
  // Since each parse run is effectively starting over, this string should indicate
  // how far we can expect to get this time
  logger.log(jsonString);

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

    logger.log('Current last container:');
    logger.log(containerStack[containerStack.length - 1]);

    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') return parseStr(allowsIncomplete);
    if (jsonString[index] === '{') return parseObj(currentKey, insideArray);

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
    logger.log(`Parsing object with parent: ${parentKey}`);
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

      logger.log(`Starting new object with key: ${parentKey}`);
      logger.log(nextContainer);

      if (nextContainer == null) {
        throwMalformedError(`Key: ${parentKey} not expected in container`);
      }

      containerStack.push(nextContainer);
    }

    let currentContainerStackIndex = containerStack.length - 1;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          const currentContainer = containerStack[currentContainerStackIndex];

          if (
            !Array.isArray(currentContainer) &&
            s.isStreaming(currentContainer)
          ) {
            logger.log('Index >= length: returning partial object');
            return obj;
          } else {
            logger.log(
              'Index >= length: opting not to return partial obj if non-streaming properties are missing',
            );

            // Are all non-streaming fields present?
            if (
              Object.entries(
                (currentContainer[internal].definition as any).shape,
              ).every(([key, subSchema]) => {
                logger.log(
                  `key ${key} is streaming: ${s.isStreaming(subSchema as any)} and present: ${key in obj}`,
                );
                if (s.isStreaming(subSchema as any) || key in obj) {
                  return true;
                }

                return false;
              })
            ) {
              return obj;
            }

            throw new IncompleteNonStreamingObject(
              'Incomplete but non-streaming object found',
            );
          }
        }

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          logger.log(`Handling key: ${key}`);

          if (key === s.DISCRIMINATOR) {
            const value = parseAny(key, false, false);
            logger.log(
              `Noting discriminator key of: ${key} and value of: ${value}`,
            );
            discriminatorValue = value;
            const currentContainer = containerStack[containerStack.length - 1];

            const matchingSchema = (currentContainer as any).filter(
              (schema: HashbrownType) => {
                const discriminatorSchemaValue = (
                  schema[internal].definition as any
                ).shape[s.DISCRIMINATOR][internal].definition.value;
                logger.log(
                  `Is ${discriminatorSchemaValue} === ${discriminatorValue}`,
                );
                return discriminatorSchemaValue === discriminatorValue;
              },
            );

            logger.log(
              `Found matching schema in current container for ${discriminatorValue}: ${!!matchingSchema}`,
            );

            if (matchingSchema.length > 0) {
              logger.log('Adding schema for discriminator');
              logger.log(matchingSchema);
              containerStack.push(matchingSchema[0]);
              currentContainerStackIndex = containerStack.length - 1;

              obj[key] = value;
            } else {
              throwMalformedError(
                `No schema found for discriminator: ${discriminatorValue}`,
              );
            }
          } else {
            const schemaFragmentForKey = (
              containerStack[currentContainerStackIndex][internal]
                .definition as any
            ).shape[key];

            const currentKeyAllowsIncomplete =
              s.isStreaming(schemaFragmentForKey);

            logger.log(
              `Object key ${key} in container ${currentContainerStackIndex} allows incomplete: ${currentKeyAllowsIncomplete}`,
            );

            const value = parseAny(key, currentKeyAllowsIncomplete, false);

            logger.log('Value:');
            logger.log(value);
            obj[key] = value;
          }
        } catch (e) {
          logger.error(e);

          /*
            We'll get here if a value or the object is not complete.

            We'll either be:
            - in an object that is or is not streaming
            - in an array for AnyOf, which means we aren't streaming
          */
          const currentContainer = containerStack[currentContainerStackIndex];

          if (
            !Array.isArray(currentContainer) &&
            s.isStreaming(currentContainer)
          ) {
            logger.log('Inner: returning partial object');
            return obj;
          } else {
            logger.log(
              'Inner: opting not to return partial obj if non-streaming properties are missing',
            );

            // Are all non-streaming fields present?
            if (
              Object.entries(
                (currentContainer[internal].definition as any).shape,
              ).every(([key, subSchema]) => {
                logger.log(
                  `key ${key} is streaming: ${s.isStreaming(subSchema as any)} and present: ${key in obj}`,
                );
                if (s.isStreaming(subSchema as any) || key in obj) {
                  return true;
                }

                return false;
              })
            ) {
              return obj;
            }

            throw new IncompleteNonStreamingObject(
              'Incomplete but non-streaming object found',
            );
          }
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.log(e);

      // /*
      //   We'll get here if a key is not completes

      //   We'll either be:
      //   - in an object that is or is not streaming
      //   - in an array for AnyOf, which means we aren't streaming
      // */
      const currentContainer = containerStack[currentContainerStackIndex];

      if (!Array.isArray(currentContainer) && s.isStreaming(currentContainer)) {
        logger.log('Outer: returning partial object');
        return obj;
      } else {
        logger.log(
          'Outer: opting not to return partial obj if non-streaming properties are missing',
        );
        // Are all non-streaming fields present?
        if (
          Object.entries(
            (currentContainer[internal].definition as any).shape,
          ).every(([key, subSchema]) => {
            logger.log(
              `key ${key} is streaming: ${s.isStreaming(subSchema as any)} and present: ${key in obj}`,
            );
            if (s.isStreaming(subSchema as any) || key in obj) {
              return true;
            }

            return false;
          })
        ) {
          return obj;
        }

        throw new IncompleteNonStreamingObject(
          'Incomplete but non-streaming object found',
        );
      }
    }
    index++; // skip final brace

    // Are we inside an array?  They handle adding/removing stack containers for themselves
    // Unless it's an AnyOf, then go ahead and pop
    if (!insideArray || discriminatorValue) {
      // Done with this container, so pop off stack
      const completedContainer = containerStack.pop();
      logger.log(
        `Completed container: ${completedContainer?.[internal].definition.description}`,
      );
    } else {
      logger.log('Inside array. Object completed, but keeping container stack');
    }
    return obj;
  };

  const parseArr = (currentKey: string, allowsIncomplete: boolean) => {
    index++; // skip initial bracket
    logger.log('parseArr: Start');
    const arr = [];

    let arrayContainer = (
      containerStack[containerStack.length - 1][internal].definition as any
    ).element;

    if (currentKey) {
      arrayContainer = (
        containerStack[containerStack.length - 1][internal].definition as any
      ).shape[currentKey][internal].definition.element;
    }

    logger.log('Array container: ');
    logger.log(arrayContainer);

    logger.log(`Is anyOf? ${s.isAnyOfType(arrayContainer)}`);

    let containerNeedsPopping = false;
    let contentsAllowIncomplete = false;

    // If this array is of objects, push the container onto the stack
    if (s.isObjectType(arrayContainer)) {
      logger.log('Array container is object type');
      containerStack.push(arrayContainer);
      containerNeedsPopping = true;
    } else if (s.isAnyOfType(arrayContainer)) {
      logger.log(
        'Array container is anyOf. Pushing anyOf array to container stack',
      );
      containerStack.push((arrayContainer as any)[internal].definition.options);
      containerNeedsPopping = true;
    } else {
      logger.log('Array container is primitive');
      // It's not an object, so check if it is a streaming primitive
      contentsAllowIncomplete = isStreaming(arrayContainer);

      logger.log(
        `Array primitive content allows streaming: ${contentsAllowIncomplete}`,
      );
    }

    try {
      while (jsonString[index] !== ']') {
        logger.log(
          `Array content allows incomplete: ${contentsAllowIncomplete}`,
        );
        arr.push(parseAny('', contentsAllowIncomplete, true));
        skipBlank();
        if (jsonString[index] === ',') {
          index++; // skip comma
        }
      }
    } catch (e) {
      // console.log(e);
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
            logger.error(e);
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

  try {
    return parseAny('', true, false);
  } catch (e) {
    if (e instanceof IncompleteNonStreamingObject) {
      logger.log('Got incomplete object error at top level');
    }

    return '';
  }
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
