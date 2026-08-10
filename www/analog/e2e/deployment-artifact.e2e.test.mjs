import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const deploymentDirectory = new URL(
  '../../../dist/www/analog/',
  import.meta.url,
);
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

test('production build creates a deployable Cloudflare Pages artifact', async () => {
  const artifactStats = await Promise.all([
    stat(new URL('_worker.js/index.js', deploymentDirectory)),
    stat(new URL('index.html', deploymentDirectory)),
  ]);

  assert.equal(
    artifactStats.every((artifact) => artifact.isFile()),
    true,
  );
});

test('production HTML references a built favicon', async () => {
  const html = await readFile(
    new URL('index.html', deploymentDirectory),
    'utf8',
  );

  const faviconPath = html.match(
    /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["'](\/[^"']+)["'])[^>]*>/,
  )?.[1];
  const faviconExists = faviconPath
    ? await stat(new URL(faviconPath.slice(1), deploymentDirectory)).then(
        (favicon) => favicon.isFile(),
        () => false,
      )
    : false;

  assert.equal(faviconExists, true);
});

test('production worker renders dynamic pages with built client assets', async () => {
  const worker = (
    await import(new URL('_worker.js/index.js', deploymentDirectory))
  ).default;
  const routes = [
    {
      path: '/docs/angular/start/quick',
      expectedContent: 'Angular Quick Start',
    },
    {
      path: '/blog/2026-07-09-hashbrown-v-0-5-0',
      expectedContent:
        'Hashbrown v0.5 makes generative UI easier to build, stream, and reuse',
    },
  ];
  const environment = {
    ASSETS: {
      fetch: async () => new Response('Not found', { status: 404 }),
    },
  };
  const context = { waitUntil: () => undefined };

  const responses = await Promise.all(
    routes.map(({ path }) =>
      worker.fetch(
        new Request(new URL(path, 'https://hashbrown.dev')),
        environment,
        context,
      ),
    ),
  );
  const pages = await Promise.all(
    responses.map(async (response, index) => ({
      expectedContent: routes[index].expectedContent,
      html: await response.text(),
      status: response.status,
    })),
  );

  for (const page of pages) {
    const moduleScript = page.html.match(
      /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/,
    );

    assert.equal(page.status, 200);
    assert.ok(moduleScript);
    assert.match(moduleScript[1], /^\/assets\/[^"']+\.js$/);
    assert.equal(
      (
        await stat(new URL(moduleScript[1].slice(1), deploymentDirectory))
      ).isFile(),
      true,
    );
    assert.match(page.html, new RegExp(page.expectedContent));
    assert.doesNotMatch(page.html, /\/src\/(?:main\.ts|styles\.css)/);
  }
});

test('production worker bundles RxJS dependencies', async () => {
  const workerDirectory = new URL('_worker.js/', deploymentDirectory);
  const files = await listJavaScriptFiles(workerDirectory);
  const imports = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    for (const moduleSpecifier of collectRxjsImports(source)) {
      imports.push({
        file: file.href.slice(workerDirectory.href.length),
        moduleSpecifier,
      });
    }
  }

  assert.deepEqual(imports, []);
});

test('production worker does not render internal code examples as content routes', async () => {
  const worker = (
    await import(new URL('_worker.js/index.js', deploymentDirectory))
  ).default;

  const response = await worker.fetch(
    new Request(
      'https://hashbrown.dev/getting-started/angular/generative-ui/app',
    ),
    {
      ASSETS: {
        fetch: async () => new Response('Not found', { status: 404 }),
      },
    },
    { waitUntil: () => undefined },
  );
  const html = await response.text();

  assert.doesNotMatch(html, /exposeComponent\(LoginViewComponent/);
});

test('Wrangler deploys the production build directory', async () => {
  const config = await readFile(
    new URL('../wrangler.toml', import.meta.url),
    'utf8',
  );
  const outputDirectory = config.match(
    /^pages_build_output_dir\s*=\s*"([^"]+)"$/m,
  )?.[1];
  const configuredDirectory = new URL(
    `${outputDirectory}/`,
    new URL('../', import.meta.url),
  );

  assert.equal(configuredDirectory.href, deploymentDirectory.href);
  assert.match(config, /^compatibility_flags\s*=\s*\["nodejs_compat"\]$/m);
});

test('production build generates the Wrangler deployment config', async () => {
  const redirectDirectory = new URL('../.wrangler/deploy/', import.meta.url);
  const redirect = JSON.parse(
    await readFile(new URL('config.json', redirectDirectory), 'utf8'),
  );
  const generatedConfigUrl = new URL(redirect.configPath, redirectDirectory);
  const generatedConfig = JSON.parse(
    await readFile(generatedConfigUrl, 'utf8'),
  );
  const generatedOutputDirectory = new URL(
    `${generatedConfig.pages_build_output_dir}/`,
    generatedConfigUrl,
  );

  assert.equal(generatedConfig.name, 'hashbrown-www');
  assert.deepEqual(generatedConfig.compatibility_flags, ['nodejs_compat']);
  assert.equal(generatedOutputDirectory.href, deploymentDirectory.href);
});

test('Nx deploys the prebuilt worker with the Wrangler config', async () => {
  const project = JSON.parse(
    await readFile(new URL('../project.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    project.targets.deploy.options.command,
    'npx wrangler --cwd=www/analog pages deploy ../../dist/www/analog --project-name=hashbrown-www --commit-dirty=true --no-bundle',
  );
});
