/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * From the root of the monorepo, run:
 *
 * ```sh
 * npm run docs:draft -- --framework react --prompt "How to stream structured data from LLM to UI"
 * ```
 *
 * Generate a *new* Hashbrown documentation page (Markdown) using OpenAI.
 * You provide:
 *   --framework <react|angular>
 *   --prompt "Describe the new page you want"
 *
 * It will:
 *   1) Load local Hashbrown docs for the chosen framework
 *   2) Build a compact "docs digest" (headings + key snippets)
 *   3) Ask the model to draft a new doc that fits your prompt
 *   4) Save it to disk as Markdown
 *
 * Examples:
 *   npm run docs:draft -- --framework react --prompt "How to stream structured data from LLM to UI"
 *   npm run docs:draft -- --framework angular --prompt-file ./notes/new-page-idea.txt
 *
 * Optional:
 *   --out "src/app/pages/docs/react/guides/streaming-data.md"
 *   --force   (overwrite if target exists)
 */
import 'dotenv/config';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import OpenAI from 'openai';
import chalk from 'chalk';

/* ------------------------------------------------------------------ */
/* CLI PARSING                                                         */
/* ------------------------------------------------------------------ */
const argv = parseArgs(process.argv.slice(2));

if (!argv.framework) {
  console.error(
    chalk.red('Error:'),
    'You must pass --framework <react|angular>',
  );
  process.exit(1);
}
const FRAMEWORK = String(argv.framework).toLowerCase();
if (!['react', 'angular'].includes(FRAMEWORK)) {
  console.error(
    chalk.red('Error:'),
    '--framework must be "react" or "angular"',
  );
  process.exit(1);
}

let userPrompt = argv.prompt;
if (!userPrompt && argv['prompt-file']) {
  try {
    userPrompt = await readFile(String(argv['prompt-file']), 'utf8');
  } catch {
    console.error(
      chalk.red('Error:'),
      `Could not read --prompt-file: ${argv['prompt-file']}`,
    );
    process.exit(1);
  }
}
if (!userPrompt) {
  console.error(
    chalk.red('Error:'),
    'You must provide --prompt "<text>" or --prompt-file <path>',
  );
  process.exit(1);
}

const OUT_PATH = argv.out ? String(argv.out) : undefined;
const FORCE = Boolean(argv.force);

/* ------------------------------------------------------------------ */
/* OPENAI CONFIG                                                       */
/* ------------------------------------------------------------------ */
const openai = new OpenAI();
const MODEL = 'o3';

/* ------------------------------------------------------------------ */
/* CONFIG & HELPERS                                                    */
/* ------------------------------------------------------------------ */

const DOCS_ROOT = 'www/src/app/pages/docs';

/** Minimal CLI flag parser (avoids external deps) */
function parseArgs(args: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const val =
        args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[key] = val;
    }
  }
  return out as {
    framework?: string;
    prompt?: string;
    'prompt-file'?: string;
    out?: string;
    force?: boolean;
  };
}

/** Slugify a title or prompt to a filename */
function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/['"’”“]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Load a Hashbrown `*.api.md` report if it exists */
async function loadApiReport(pkg: string): Promise<string> {
  try {
    return await readFile(join(`../packages/${pkg}/${pkg}.api.md`), 'utf8');
  } catch {
    return '';
  }
}

/**
 * Read all Markdown docs for the chosen framework and produce a compact digest
 * to keep tokens under control:
 *  - keep H1-H3 headings
 *  - keep first paragraph after H1
 *  - sample up to N code fences per file
 *  - cap per-file bytes
 */
async function buildDocsDigest(framework: 'react' | 'angular') {
  // Recursively list everything under DOCS_ROOT
  const all = await readdir(DOCS_ROOT, { recursive: true });
  const byFramework = all
    .filter((p) => p.endsWith('.md'))
    .filter((p) => p.includes(`${framework}/`));

  const digestParts: string[] = [];

  for (const rel of byFramework) {
    const full = join(DOCS_ROOT, rel);
    let raw = '';
    try {
      raw = await readFile(full, 'utf8');
    } catch {
      continue;
    }

    digestParts.push(JSON.stringify({ filePath: rel, contents: raw }));
  }

  return digestParts.join('\n');
}

/** Safely ensure a directory exists */
async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

/** Check if a file exists */
async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* LLM CALL                                                            */
/* ------------------------------------------------------------------ */

async function generateDraft(opts: {
  framework: 'react' | 'angular';
  userPrompt: string;
  docsDigest: string;
  apiReports: string[];
}) {
  const { framework, userPrompt, docsDigest, apiReports } = opts;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are a senior technical writer for Hashbrown, expert in ${framework} and AI.
Your task: write a **brand-new** documentation page.

CONTEXT
-------
You will receive:
1) A compact digest of the existing Hashbrown docs for ${framework} (headings, intros, code samples).
2) API reports (if available), to keep code examples factual.

STYLE & CONSTRAINTS
-------------------
 - Tone: Explainative, friendly, confident; no hype, no fluff.
 - Prefer practical examples over long exposition.
 - Use correct, idiomatic ${framework} patterns (hooks & functional components for React; standalone components & signals where suitable for Angular).
 - Keep headings clear and scannable (H2/H3).
 - Use fenced code blocks with language tags.
 - Assume the reader already uses Hashbrown; focus on *doing*, not selling.
 - Output valid Markdown **only** (no front-matter).
 - Include a short "Before you start" section if prerequisites matter.
 - If the user prompt is too broad, choose a crisp, teachable slice and proceed.
 - Do not create your own abbreviations
 - Avoid using emdashes
 - Avoid using emojis
 - Never mention building offline apps or local-first apps.
 - Keep it branded to Hashbrown. Limited, tongue-in-cheek food metaphors are fun.

MARKDOWN EXTENSION
------------------
The generated Markdown has a special extension in it that allows referencing a specific symbol.
Use the reference ID for a symbol to leverage this extension.

Example:
\`\`\`md
Call @hashbrownai/react!useTool:function to create a tool
\`\`\`

This will be rendered as a link to the \`useTool\` function in the React docs. Only use this
in paragraph blocks.


REACT
-----
When generating React documentation, follow these rules:
 - Functional and reactive.
 - Expert-level React code.
 - Wrap Hashbrown's useTool and useRuntimeFunction hooks.
 - Make sure all hooks are called in the context of a React component.


RETURN FORMAT (JSON)
--------------------
\`\`\`json
{
  "title": "Title of the new page",
  "slug": "kebab-case-filename-without-ext",
  "markdown": "### Full markdown for the new page",
  "notes": "Optional notes for the editor"
}
\`\`\`

API REPORTS (for reference; omit from output)
---------------------------------------------
${apiReports.filter(Boolean).join('\n\n---\n')}
      `.trim(),
    },
    {
      role: 'user',
      content: `
USER PROMPT
-----------
${userPrompt.trim()}

HASHBROWN DOCS DIGEST (${framework})
------------------------------------
${docsDigest}
      `.trim(),
    },
  ];

  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'DraftDoc',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            slug: { type: 'string' },
            markdown: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['markdown'],
        },
      },
    },
    messages,
  });

  const payload = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
    title?: string;
    slug?: string;
    markdown: string;
    notes?: string;
  };

  // Fallbacks
  if (!payload.slug) payload.slug = slugify(payload.title || userPrompt);
  if (!payload.title) {
    // Try first heading
    const h1 = payload.markdown.match(/^#\s+(.+)$/m)?.[1];
    payload.title = h1 || userPrompt.trim();
  }

  return payload;
}

/* ------------------------------------------------------------------ */
/* MAIN                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(
    chalk.cyan(`\nDrafting new ${FRAMEWORK} doc from prompt:`),
    chalk.gray(`\n“${(userPrompt || '').trim()}”\n`),
  );

  // Build docs digest
  console.log(chalk.gray(' - Reading local docs and building digest... '));
  const docsDigest = await buildDocsDigest(FRAMEWORK as 'react' | 'angular');
  if (docsDigest.length === 0) {
    console.log(chalk.red('Error: No docs found'));
    return;
  }
  console.log(chalk.green('done'));

  // Pre-load relevant API reports (core + framework + common providers)
  console.log(chalk.gray(' - Loading API reports... '));
  const apiReports = await Promise.all(
    ['core', FRAMEWORK, 'azure', 'google', 'openai', 'writer'].map(
      loadApiReport,
    ),
  );
  if (apiReports.length === 0) {
    console.log(chalk.red('Error: No API reports found'));
    return;
  }
  console.log(chalk.green('done'));

  // Generate draft
  console.log(chalk.gray(' - Calling OpenAI to draft the page... '));
  const draft = await generateDraft({
    framework: FRAMEWORK as 'react' | 'angular',
    userPrompt: userPrompt!,
    docsDigest,
    apiReports,
  });
  console.log(chalk.green('done'));

  // Determine output path
  let outPath = OUT_PATH;
  if (!outPath) {
    // Default under the chosen framework
    outPath = join(
      DOCS_ROOT,
      FRAMEWORK,
      'drafts',
      `${slugify(draft.slug || draft.title || userPrompt!)}.md`,
    );
  }

  if (!FORCE && (await exists(outPath))) {
    // Add a numeric suffix
    const base = outPath.replace(/\.md$/i, '');
    let i = 2;
    while (await exists(`${base}-${i}.md`)) i++;
    outPath = `${base}-${i}.md`;
  }

  await ensureDir(dirname(outPath));
  await writeFile(outPath, draft.markdown.trim() + '\n', 'utf8');

  console.log(
    chalk.green.bold('\n✔'),
    chalk.green('Draft written to'),
    chalk.bold(relative(process.cwd(), outPath)),
  );

  if (draft.title) {
    console.log(chalk.gray('   Title:'), draft.title);
  }
  if (draft.notes) {
    console.log(chalk.gray('   Notes:'), draft.notes.trim());
  }
}

main().catch((e) => {
  console.error(chalk.red.bold('✖'), chalk.red('Draft generation failed'));
  console.error(e);
  process.exit(1);
});
