class PartialJSON extends Error {}

class MalformedJSON extends Error {}

function parseJSON(jsonString: string, streamablePaths: string[]): any {
  if (typeof jsonString !== 'string') {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    throw new Error(`${jsonString} is empty`);
  }
  return _parseJSON(jsonString.trim(), streamablePaths);
}

const _parseJSON = (jsonString: string, streamablePaths: string[]) => {
  const length = jsonString.length;
  let index = 0;

  const markPartialJSON = (msg: string) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };

  const throwMalformedError = (msg: string) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };

  const parseAny: (currentPath: string) => any = () => {
    skipBlank();
    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') return parseStr();
    if (jsonString[index] === '{') return parseObj();
    if (jsonString[index] === '[') return parseArr();
    if (
      jsonString.substring(index, index + 4) === 'null' ||
      (Allow.NULL & allow &&
        length - index < 4 &&
        'null'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return null;
    }
    if (
      jsonString.substring(index, index + 4) === 'true' ||
      (Allow.BOOL & allow &&
        length - index < 4 &&
        'true'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return true;
    }
    if (
      jsonString.substring(index, index + 5) === 'false' ||
      (Allow.BOOL & allow &&
        length - index < 5 &&
        'false'.startsWith(jsonString.substring(index)))
    ) {
      index += 5;
      return false;
    }

    return parseNum();
  };

  const parseStr: () => string = () => {
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
    } else if (Allow.STR & allow) {
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
        if (index >= length && Allow.OBJ & allow) return obj;
        const key = parseStr();
        skipBlank();
        index++; // skip colon
        try {
          const value = parseAny();
          obj[key] = value;
        } catch (e) {
          if (Allow.OBJ & allow) return obj;
          else throw e;
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      if (Allow.OBJ & allow) return obj;
      else markPartialJSON("Expected '}' at end of object");
    }
    index++; // skip final brace
    return obj;
  };

  const parseArr = () => {
    index++; // skip initial bracket
    const arr = [];
    try {
      while (jsonString[index] !== ']') {
        arr.push(parseAny());
        skipBlank();
        if (jsonString[index] === ',') {
          index++; // skip comma
        }
      }
    } catch (e) {
      if (Allow.ARR & allow) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++; // skip final bracket
    return arr;
  };

  const parseNum = () => {
    if (index === 0) {
      if (jsonString === '-') throwMalformedError("Not sure what '-' is");
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        if (Allow.NUM & allow)
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

    if (index == length && !(Allow.NUM & allow))
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
  return parseAny('');
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
