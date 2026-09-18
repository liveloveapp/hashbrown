import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

const deploymentDirectory = new URL(
  '../../../.vercel/output/',
  import.meta.url,
);
const functionDirectory = new URL(
  'functions/__server.func/',
  deploymentDirectory,
);
const staticDirectory = new URL('static/', deploymentDirectory);
const rxjsModuleSpecifierPattern = /^rxjs(?:\/.*)?$/;
const regexPrefixKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const url = new URL(entry.name, directory);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          return [];
        }

        return listJavaScriptFiles(new URL(`${entry.name}/`, directory));
      }

      return /\.m?js$/.test(entry.name) ? [url] : [];
    }),
  );

  return files
    .flat()
    .toSorted((left, right) => left.href.localeCompare(right.href));
}

function readStringToken(source, start) {
  const quote = source[start];
  let value = '';
  let index = start + 1;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      const escapedCharacter = source[index + 1];

      if (escapedCharacter !== '\n' && escapedCharacter !== '\r') {
        value += escapedCharacter ?? '';
      }

      index += 2;
      continue;
    }

    if (character === quote) {
      return { end: index + 1, value };
    }

    value += character;
    index += 1;
  }

  return { end: index, value };
}

function canStartRegex(previousToken) {
  if (previousToken === undefined) {
    return true;
  }

  if (previousToken.type === 'identifier') {
    return regexPrefixKeywords.has(previousToken.value);
  }

  return (
    previousToken.type === 'punctuator' &&
    /^[({[=,:;!?&|+\-*%^~<>]$/.test(previousToken.value)
  );
}

function skipRegexLiteral(source, start) {
  let index = start + 1;
  let inCharacterClass = false;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      index += 2;
    } else if (character === '[') {
      inCharacterClass = true;
      index += 1;
    } else if (character === ']') {
      inCharacterClass = false;
      index += 1;
    } else if (character === '/' && !inCharacterClass) {
      index += 1;

      while (/[a-z]/i.test(source[index] ?? '')) {
        index += 1;
      }

      return index;
    } else {
      index += 1;
    }
  }

  return index;
}

function tokenizeJavaScript(source) {
  const tokens = [];

  function readTemplateLiteral(start) {
    const token = { type: 'string', value: '' };
    let index = start + 1;

    tokens.push(token);

    while (index < source.length) {
      const character = source[index];
      const nextCharacter = source[index + 1];

      if (character === '\\') {
        if (nextCharacter !== '\n' && nextCharacter !== '\r') {
          token.value += nextCharacter ?? '';
        }

        index += 2;
      } else if (character === '`') {
        return index + 1;
      } else if (character === '$' && nextCharacter === '{') {
        token.value += '${}';
        tokens.push({ type: 'punctuator', value: '{' });
        index = tokenize(index + 2, true);
        tokens.push({ type: 'punctuator', value: '}' });
      } else {
        token.value += character;
        index += 1;
      }
    }

    return index;
  }

  function tokenize(start, stopAtClosingBrace = false) {
    let braceDepth = 0;
    let index = start;

    while (index < source.length) {
      const character = source[index];
      const nextCharacter = source[index + 1];

      if (/\s/.test(character)) {
        index += 1;
        continue;
      }

      if (character === '/' && nextCharacter === '/') {
        index = source.indexOf('\n', index + 2);
        index = index === -1 ? source.length : index + 1;
        continue;
      }

      if (character === '/' && nextCharacter === '*') {
        index = source.indexOf('*/', index + 2);
        index = index === -1 ? source.length : index + 2;
        continue;
      }

      if (character === '"' || character === "'") {
        const stringToken = readStringToken(source, index);
        tokens.push({ type: 'string', value: stringToken.value });
        index = stringToken.end;
        continue;
      }

      if (character === '`') {
        index = readTemplateLiteral(index);
        continue;
      }

      if (character === '}' && stopAtClosingBrace) {
        if (braceDepth === 0) {
          return index + 1;
        }

        braceDepth -= 1;
      } else if (character === '{' && stopAtClosingBrace) {
        braceDepth += 1;
      }

      if (/[A-Za-z_$]/.test(character)) {
        const match = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
        const value = match[0];

        tokens.push({ type: 'identifier', value });
        index += value.length;
        continue;
      }

      if (character === '/' && canStartRegex(tokens.at(-1))) {
        index = skipRegexLiteral(source, index);
        continue;
      }

      tokens.push({ type: 'punctuator', value: character });
      index += 1;
    }

    return index;
  }

  tokenize(0);

  return tokens;
}

function collectRxjsImports(source) {
  const tokens = tokenizeJavaScript(source);
  const imports = [];
  const addModuleSpecifier = (token) => {
    if (
      token?.type === 'string' &&
      rxjsModuleSpecifierPattern.test(token.value)
    ) {
      imports.push(token.value);
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type !== 'identifier') {
      continue;
    }

    if (token.value === 'import') {
      if (tokens[index - 1]?.value === '.') {
        continue;
      }

      if (tokens[index + 1]?.type === 'string') {
        addModuleSpecifier(tokens[index + 1]);
        continue;
      }

      if (tokens[index + 1]?.value === '(') {
        addModuleSpecifier(tokens[index + 2]);
        continue;
      }
    } else if (token.value !== 'export') {
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor];

      if (candidate.value === ';') {
        break;
      }

      if (candidate.type === 'identifier' && candidate.value === 'from') {
        addModuleSpecifier(tokens[cursor + 1]);
        break;
      }
    }
  }

  return imports;
}

test('detects bare RxJS imports without matching serialized examples', () => {
  const source = [
    'import { Observable } from "rxjs";',
    'export { map } from "rxjs/operators";',
    'import "rxjs/ajax";',
    'import {',
    '  Subject,',
    '} from "rxjs/internal/Subject";',
    'const loadOperators = import(',
    '  "rxjs/operators",',
    ');',
    'const loadTesting = import(`rxjs/testing`);',
    'const loadOperator = import(`rxjs/${operatorName}`);',
    'const nestedImport = `${import("rxjs/webSocket")}`;',
    'const example = "import { of } from \'rxjs\';";',
    '// import "rxjs/webSocket";',
    'const pattern = /import\\("rxjs\\/testing"\\)/;',
    'const template = `export { of } from "rxjs"`;',
    'const regexInTemplate = `${/import("rxjs")/.source}`;',
  ].join('\n');

  const imports = collectRxjsImports(source);

  assert.deepEqual(imports, [
    'rxjs',
    'rxjs/operators',
    'rxjs/ajax',
    'rxjs/internal/Subject',
    'rxjs/operators',
    'rxjs/testing',
    'rxjs/${}',
    'rxjs/webSocket',
  ]);
});

test('production build creates a Vercel Build Output API artifact', async () => {
  const config = JSON.parse(
    await readFile(new URL('config.json', deploymentDirectory), 'utf8'),
  );
  const functionConfig = JSON.parse(
    await readFile(new URL('.vc-config.json', functionDirectory), 'utf8'),
  );

  assert.equal(config.version, 3);
  assert.ok(Array.isArray(config.routes) && config.routes.length > 0);
  assert.match(functionConfig.runtime, /^nodejs\d+\.x$/);
  assert.equal(functionConfig.launcherType, 'Nodejs');
  assert.equal(functionConfig.supportsResponseStreaming, true);
  assert.equal(functionConfig.maxDuration, 300);
  await stat(new URL(functionConfig.handler, functionDirectory));
  await stat(new URL('index.html', staticDirectory));
});

test('production function does not bundle bare RxJS specifiers', async () => {
  const files = await listJavaScriptFiles(functionDirectory);
  const bareImports = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    for (const specifier of collectRxjsImports(source)) {
      bareImports.push(
        `${file.href.slice(functionDirectory.href.length)}: ${specifier}`,
      );
    }
  }

  assert.deepEqual(bareImports, []);
});

test('production build excludes removed Writer provider artifacts', async () => {
  const files = [
    ...(await listJavaScriptFiles(functionDirectory)),
    ...(await listJavaScriptFiles(staticDirectory)),
  ];
  const writerFiles = files.filter((file) =>
    /(?:^|\/)writer-[^/]+\.js$/.test(file.pathname),
  );
  const writerReferences = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    if (
      /@hashbrownai\/writer|WriterKnownModelIds|Writer adapter/.test(source)
    ) {
      writerReferences.push(file.href.slice(deploymentDirectory.href.length));
    }
  }

  assert.deepEqual(writerFiles, []);
  assert.deepEqual(writerReferences, []);
});

test('production HTML references a built favicon', async () => {
  const html = await readFile(new URL('index.html', staticDirectory), 'utf8');

  const faviconPath = html.match(
    /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["'](\/[^"']+)["'])[^>]*>/,
  )?.[1];
  const faviconExists = faviconPath
    ? await stat(new URL(faviconPath.slice(1), staticDirectory)).then(
        (favicon) => favicon.isFile(),
        () => false,
      )
    : false;

  assert.equal(faviconExists, true);
});

test('production function server-renders a docs page from the built template', async () => {
  const { default: handler } = await import(
    new URL('index.mjs', functionDirectory)
  );
  const server = createServer(handler);
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/docs/angular/start/quick`,
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(html, /Angular Quick Start/);
    // Analog falls back to this shell when the built index.html is not found.
    assert.doesNotMatch(html, /<body><div id="app"><\/div><\/body>/);
  } finally {
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});

test('production function server-renders the home page, parallax and all', async () => {
  const { default: handler } = await import(
    new URL('index.mjs', functionDirectory)
  );
  const server = createServer(handler);
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    // The home page runs browser-only work (parallax over `window` and
    // requestAnimationFrame). Reaching for it during the render throws out of
    // change detection and Analog serves the client-side shell instead, so the
    // page ships with no content for crawlers. Guard the route that regressed,
    // not just a docs page.
    assert.doesNotMatch(html, /<body><div id="app"><\/div><\/body>/);
    assert.match(html, /hb-hashy-skates-hashy/);
  } finally {
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});

test('Nx deploys the prebuilt output with the Vercel CLI', async () => {
  const project = JSON.parse(
    await readFile(new URL('../project.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    project.targets.deploy.options.command,
    'npx vercel deploy --prebuilt --yes',
  );
});
