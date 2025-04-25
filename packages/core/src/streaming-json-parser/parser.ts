import { s } from '../schema';
import { internal } from '../schema/internal/base';

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

  //   console.log(containerStack);

  const markPartialJSON = (msg: string) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };

  const throwMalformedError = (msg: string) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };

  const parseAny: (currentKey: string, allowsIncomplete: boolean) => any = (
    currentKey,
    allowsIncomplete,
  ) => {
    skipBlank();

    console.log('Current container stack:');
    // console.log(JSON.stringify(containerStack, null, 4));
    console.log(containerStack);

    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') return parseStr(allowsIncomplete);
    if (jsonString[index] === '{') {
      //   console.log(
      //     (containerStack[containerStack.length - 1] as any).definition,
      //   );
      // Find key in current level of document stock, and add to stack
      if (currentKey !== '') {
        const nextContainer = (
          containerStack[containerStack.length - 1][internal].definition as any
        ).shape[currentKey];

        console.log(`Starting new object with key: ${currentKey}`);
        console.log(nextContainer);

        if (nextContainer == null) {
          throwMalformedError(`Key: ${currentKey} not expected in container`);
        }

        containerStack.push(nextContainer);
      }

      return parseObj();
    }
    if (jsonString[index] === '[') return parseArr(allowsIncomplete);
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

  const parseObj = () => {
    index++; // skip initial brace
    skipBlank();
    const obj: Record<string, any> = {};
    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) return obj;

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          const currentContainer = containerStack[containerStack.length - 1];

          const currentKeyAllowsIncomplete = s.isStreaming(
            (currentContainer[internal].definition as any).shape[key],
          );

          console.log(
            (currentContainer[internal].definition as any).shape[key],
          );

          console.log(
            `Key: ${key} allows streaming: ${currentKeyAllowsIncomplete}`,
          );

          const value = parseAny(key, currentKeyAllowsIncomplete);

          console.log(value);
          obj[key] = value;
        } catch (e) {
          console.error(e);
          return obj;
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      console.log(e);
      return obj;
    }
    index++; // skip final brace

    // Done with this container, so pop off stack
    const completedContainer = containerStack.pop();
    console.log(
      `Completed container: ${completedContainer?.[internal].definition.description}`,
    );
    return obj;
  };

  const parseArr = (allowsIncomplete: boolean) => {
    index++; // skip initial bracket
    const arr = [];
    try {
      while (jsonString[index] !== ']') {
        // TODO: this is almost certainly the wrong thing, but I just want to see
        // what happens at this point in development
        arr.push(parseAny('', false));
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
  return parseAny('', true);
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
