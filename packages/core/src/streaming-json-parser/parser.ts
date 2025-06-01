/**
 * Skillet is an LLM-optimized streaming JSON Parser - perfectly suited for streaming hot and fresh JSON.
 *
 * Portions of this code are derived from partial-json (MIT License) (https://github.com/promplate/partial-json-parser-js).
 * See the LICENSE file in the project root for full license text.
 *
 * @license MIT
 * @author LiveLoveApp, LLC
 * @see https://github.com/liveloveapp/hashbrown
 * @see https://github.com/promplate/partial-json-parser-js
 */

import { Logger } from '../logger/logger';
import { s } from '../schema';
import { isStreaming } from '../schema/is-streaming';
import {
  internal,
  isAnyOfType,
  isObjectType,
  PRIMITIVE_WRAPPER_FIELD_NAME,
} from '../schema/base';
import { toJsonSchema } from '../schema/to-json-schema';

const ENABLE_LOGGING = true;

class PartialJSON extends Error {}

class MalformedJSON extends Error {}

class IncompleteNonStreamingObject extends Error {}

class UnexpectedStreamingType extends Error {}

function shouldBeWrappedPrimitive(schema: s.HashbrownType): boolean {
  if (isAnyOfType(schema) || isObjectType(schema)) {
    return false;
  }

  return true;
}

function parseJSON(jsonString: string, schema: s.HashbrownType): any {
  console.log('schema:');
  console.dir(toJsonSchema(schema));

  if (typeof jsonString !== 'string') {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    return '';
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

    logger.log(`Remaining string: ${jsonString.slice(index)}`);

    const currentLastContainer = containerStack[containerStack.length - 1];

    logger.log('Current last container:');
    logger.log(currentLastContainer);

    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') return parseStr(allowsIncomplete);
    if (jsonString[index] === '{') {
      /*
        If the top-level schema is a primitive that should be object-wrapped, we 
        assume a wrapped primitive is starting

        If the current container is an array, we assume an anyOf wrapper is starting.  
        
        Else, we parse as a regular object.
      */
      if (Array.isArray(currentLastContainer)) {
        return parseAnyOf(currentKey);
      } else if (shouldBeWrappedPrimitive(currentLastContainer)) {
        return parseWrappedPrimitive();
      } else {
        return parseObj(currentKey, insideArray);
      }
    }

    if (jsonString[index] === '[')
      return parseArr(currentKey, allowsIncomplete);
    if (jsonString.substring(index, index + 4) === 'null') {
      index += 4;
      return null;
    }
    if (jsonString.substring(index, index + 4) === 'true') {
      index += 4;
      return true;
    }
    if (jsonString.substring(index, index + 5) === 'false') {
      index += 5;
      return false;
    }

    return parseNum();
  };

  const parseStr: (allowsIncomplete: boolean) => string = (
    allowsIncomplete,
  ) => {
    if (containerStack.length === 1) {
      // String literal at top level, so see if the the schema allows streaming
      allowsIncomplete = s.isStreaming(schema);
    }

    const start = index;

    // Is the next character a string?
    // parseAny checks before calling parseStr, but functions parsing
    // key names (i.e. parseObj) do not, and we need to detect potentially
    // malformed JSON immediately following a comma
    if (jsonString[start] !== '"') {
      throwMalformedError('String expected but not started');
    }

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

  const handleIncompleteWrappedPrimitive = (val: any) => {
    if (val == null) {
      throw new IncompleteNonStreamingObject(
        'Incomplete wrapped primitive object found',
      );
    }

    return val;
  };

  const parseWrappedPrimitive = () => {
    logger.log(`Parsing wrapped primitive object`);
    index++; // skip initial brace
    skipBlank();
    let value: any = undefined;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return handleIncompleteWrappedPrimitive(value);
        }

        const key = parseStr(false);

        if (key !== PRIMITIVE_WRAPPER_FIELD_NAME) {
          // How did we get here if this isn't really a wrapped primitive?
          throwMalformedError(
            `Wrapped primitive has unexpected key name: ${key}`,
          );
        }

        skipBlank();
        index++; // skip colon
        try {
          logger.log(`Handling key: ${key}`);

          const matchingSchema = containerStack[containerStack.length - 1];

          logger.log('Found top-level schema:');
          logger.log(matchingSchema);

          // This isn't a real object, so don't pass the key name
          value = parseAny('', isStreaming(matchingSchema), false);

          logger.log('Value:');
          logger.log(value);
        } catch (e) {
          logger.error(e);
          return handleIncompleteWrappedPrimitive(value);
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.log(e);

      return handleIncompleteWrappedPrimitive(value);
    }
    index++; // skip final brace

    const completedContainer = containerStack.pop();
    logger.log(
      `Completed wrapped primitive container: ${completedContainer?.[internal].definition.description}`,
    );

    return value;
  };

  const handleIncompleteAnyOf = (val: any) => {
    if (val == null) {
      throw new IncompleteNonStreamingObject('Incomplete anyOf object found');
    }

    return val;
  };

  const parseAnyOf = (parentKey: string) => {
    logger.log(`Parsing anyOf with parent: ${parentKey}`);
    index++; // skip initial brace
    skipBlank();
    let value: any = undefined;

    let currentContainerStackIndex = containerStack.length - 1;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return handleIncompleteAnyOf(value);
        }

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          logger.log(`Handling discriminator: ${key}`);

          const matchingSchema = (
            containerStack[currentContainerStackIndex] as any
          )[parseInt(key)];

          logger.log(
            `Found matching schema in current container for ${key}: ${!!matchingSchema}`,
          );

          if (matchingSchema) {
            logger.log('Adding schema for discriminator');
            logger.log(matchingSchema);

            // If the matching schema is itself an anyOf, we need to push its options array
            // to the schema stack instead of the schema
            if (s.isAnyOfType(matchingSchema)) {
              containerStack.push(
                (matchingSchema as any)[internal].definition.options,
              );
            } else {
              containerStack.push(
                s.object(`AnyOf Wrapper for ${key}`, {
                  [key]: matchingSchema,
                }),
              );
            }

            currentContainerStackIndex = containerStack.length - 1;

            value = parseAny(key, true, false);

            logger.log('Value:');
            logger.log(value);
          } else {
            throwMalformedError(`No schema found for discriminator: ${key}`);
          }
        } catch (e) {
          logger.error(e);
          return handleIncompleteAnyOf(value);
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.log(e);

      return handleIncompleteAnyOf(value);
    }
    index++; // skip final brace

    const completedContainer = containerStack.pop();
    if (Array.isArray(completedContainer)) {
      logger.log(`Completed nested anyOf container`);
    } else {
      logger.log(
        `Completed anyOf container: ${completedContainer?.[internal].definition.description}`,
      );
    }

    return value;
  };

  const handleIncompleteObject = (
    currentContainerStackIndex: number,
    obj: any,
  ) => {
    const currentContainer = containerStack[currentContainerStackIndex];

    if (s.isStreaming(currentContainer)) {
      logger.log('Index >= length: returning partial object');
      return obj;
    }

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

        // if this key is streaming and not present, add an "empty" value
        if (s.isStreaming(subSchema as any)) {
          if (!(key in obj)) {
            if (
              s.isStringType(subSchema as any) ||
              s.isLiteralType(subSchema as any) ||
              s.isEnumType(subSchema as any)
            ) {
              obj[key] = '';
            } else if (s.isArrayType(subSchema as any)) {
              obj[key] = [];
            } else if (s.isObjectType(subSchema as any)) {
              obj[key] = {};
            } else {
              throw new UnexpectedStreamingType(
                'Unexpected schema type for a streaming prop',
              );
            }
          }
          return true;
        }

        if (key in obj) {
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
  };

  const parseObj = (parentKey: string, insideArray: boolean) => {
    logger.log(`Parsing object with parent: ${parentKey}`);
    index++; // skip initial brace
    skipBlank();
    const obj: Record<string, any> = {};

    let inAnyOfWrapper = false;

    // If we are not in an array, find key in current level of document stock, and add to stack
    if (parentKey !== '') {
      // Are we in any anyOf?
      const currentContainer = containerStack[containerStack.length - 1];

      // Not an anyOf, so move down a level
      if (!Array.isArray(currentContainer)) {
        // If parentKey is set, we are not in an array, so get the next stack container
        // (arrays handle it differently, so they can do clean up when the array is complete)
        const nextContainer = (currentContainer[internal].definition as any)
          .shape[parentKey];

        logger.log(`Starting new object with key: ${parentKey}`);
        logger.log(nextContainer);

        if (nextContainer == null) {
          throwMalformedError(`Key: ${parentKey} not expected in container`);
        }

        containerStack.push(nextContainer);
      }
    }

    const currentContainerStackIndex = containerStack.length - 1;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return handleIncompleteObject(currentContainerStackIndex, obj);
        }

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          logger.log(`Handling key: ${key}`);

          const currentContainer = containerStack[currentContainerStackIndex];

          // Is this an anyOf (which can happen for nested anyOfs)
          if (s.isAnyOfType(currentContainer)) {
            // Property is anyOf, so push option list to container stack
            containerStack.push(
              (currentContainer as any)[internal].definition.options,
            );

            logger.log(
              `Object key ${key} in container ${currentContainerStackIndex} is anyOf`,
            );

            // AnyOfs are never directly streaming
            const value = parseAny(key, false, false);

            inAnyOfWrapper = true;

            logger.log('Value:');
            logger.log(value);
            obj[key] = value;
          } else {
            // This is a regular object, so find the schema for the key
            const schemaFragmentForKey = (
              currentContainer[internal].definition as any
            ).shape[key];

            if (s.isAnyOfType(schemaFragmentForKey)) {
              // Property is anyOf, so push option list to container stack
              containerStack.push(
                (schemaFragmentForKey as any)[internal].definition.options,
              );

              logger.log(
                `Object key ${key} in container ${currentContainerStackIndex} is anyOf`,
              );

              // AnyOfs are never directly streaming
              const value = parseAny(key, false, false);

              inAnyOfWrapper = true;

              logger.log('Value:');
              logger.log(value);
              obj[key] = value;
            } else {
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
          }
        } catch (e) {
          logger.error(e);
          return handleIncompleteObject(currentContainerStackIndex, obj);
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.log(e);

      return handleIncompleteObject(currentContainerStackIndex, obj);
    }
    index++; // skip final brace

    // Are we inside an array?  They handle adding/removing stack containers for themselves
    if (!insideArray || inAnyOfWrapper) {
      // If we just completed an anyOf wrapper, we need to pop the options array off the stack
      if (!insideArray && inAnyOfWrapper) {
        const completedContainer = containerStack.pop();
        logger.log(`Also completed anyOf container: ${completedContainer}`);
      }

      // Done with this container, so pop off stack
      const completedContainer = containerStack.pop();
      logger.log(
        `Completed object container: ${completedContainer?.[internal].definition.description}`,
      );
    } else {
      logger.log('Inside array. Object completed, but keeping container stack');
    }
    return obj;
  };

  const parseArr = (currentKey: string, allowsIncomplete: boolean) => {
    if (containerStack.length === 1 && s.isArrayType(containerStack[0])) {
      // See if the the schema allows streaming
      allowsIncomplete = s.isStreaming(schema);
    }

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

    logger.log(`Allows streaming? ${allowsIncomplete}`);

    // logger.log(`Is anyOf? ${s.isAnyOfType(arrayContainer)}`);

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

  const parseNum = () => {
    if (index === 0) {
      if (jsonString === '-') throwMalformedError("Not sure what '-' is");
      try {
        // JSON string starts with a number, so we'll try to parse the whole thing as one.
        // Thus, set index to length.
        index = jsonString.length;

        return JSON.parse(jsonString);
      } catch (e) {
        throwMalformedError(String(e));
      }
    }

    const start = index;

    if (jsonString[index] === '-') index++;
    while (jsonString[index] && ',]}'.indexOf(jsonString[index]) === -1)
      index++;

    if (index == length) markPartialJSON('Unterminated number literal');

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
    const result = parseAny('', false, false);

    // We returned, but have we not consumed the whole length?
    if (index < length) {
      throwMalformedError('Extra data after end of parsing');
    }

    return result;
  } catch (e) {
    if (e instanceof IncompleteNonStreamingObject) {
      logger.log('Got incomplete object error at top level');

      return '';
    }

    if (e instanceof PartialJSON) {
      logger.log('Got unterminated container');

      return '';
    }

    if (e instanceof MalformedJSON) {
      if (e.message.includes('Exponent part is missing a number')) {
        logger.log('Found number with exponent sans number');
        return '';
      }

      if (e.message.includes('Unterminated fractional number')) {
        logger.log('Found number with decimal point sans numbers');
        return '';
      }
    }

    throw e;
  }
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
