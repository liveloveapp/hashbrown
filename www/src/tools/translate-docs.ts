/**
 * translate-docs.ts
 *
 * Transliterate documentation from one framework to another with GPT-4o,
 * optionally merging the result with an existing target doc.
 *
 * Example:
 *   npx nx run www:translate-docs -- --from angular --to react
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import OpenAI from 'openai';
import chalk from 'chalk';

/* ------------------------------------------------------------------ */
/* CLI PARSING                                                         */
/* ------------------------------------------------------------------ */
const argv = parseArgs(process.argv.slice(2));

if (!argv.from || !argv.to) {
  console.error(
    chalk.red('Error:'),
    'You must pass --from <framework> and --to <framework>',
  );
  process.exit(1);
}

const FROM = argv.from.toLowerCase();
const TO = argv.to.toLowerCase();

if (FROM === TO) {
  console.error(chalk.red('Error:'), '--from and --to cannot be the same');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* OPENAI CONFIG                                                       */
/* ------------------------------------------------------------------ */
const openai = new OpenAI();
const MODEL = 'gpt-4o-mini';

/* ------------------------------------------------------------------ */
/* HELPERS                                                             */
/* ------------------------------------------------------------------ */

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
  return out as { from?: string; to?: string };
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
 * Translate or refine a single doc.
 *
 * If `existing` is provided it becomes extra context so that human
 * modifications are preserved.
 */
async function transflateDoc(opts: {
  apiReports: string[];
  fromFramework: string;
  toFramework: string;
  sourceDoc: string;
  existingTargetDoc?: string;
  relPath: string;
}): Promise<{ markdown: string; observations?: string }> {
  const {
    apiReports,
    fromFramework,
    toFramework,
    sourceDoc,
    existingTargetDoc,
    relPath,
  } = opts;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are a senior technical writer familiar with Hashbrown's SDKs.

GOAL
----
Transform Markdown written for the **${fromFramework}** SDK into Markdown for the **${toFramework}** SDK.

CONSTRAINTS
-----------
• Preserve tone, structure, and pedagogical flow.  
• Replace ${fromFramework}-specific APIs with idiomatic ${toFramework} counterparts using the accompanying API reports.  
• Use best practices for ${toFramework} (e.g. functional components & hooks for React, Composition API for Vue, etc.).  
• Keep all headings and ordering unless a change is required by framework differences.  
• Output valid Markdown only, no front-matter or extra commentary.

WHEN AN EXISTING TARGET DOC IS SUPPLIED
---------------------------------------
If \`existingTargetDoc\` appears below, treat it as the **authoritative starting point** (it may contain manual edits).  
– Keep its improvements.  
– Update only sections that need API or example changes.  
– Preserve any human-added caveats or clarifications unless obsolete.

RETURN FORMAT
-------------
\`\`\`json
{
  "markdown": "<final target markdown>",
  "observations": "<optional free-form notes>"
}
\`\`\`

API REPORTS
-----------
${apiReports.join('\n\n\n')}
    `.trim(),
    },
    {
      role: 'user',
      content: `
### Source documentation (${fromFramework}) – relative path: ${relPath}
${sourceDoc}
      `.trim(),
    },
  ];

  if (existingTargetDoc) {
    messages.push({
      role: 'user',
      content: `
### existingTargetDoc (${toFramework}) – same relative path
${existingTargetDoc}
      `.trim(),
    });
  }

  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'Transflation',
        schema: {
          type: 'object',
          properties: {
            markdown: { type: 'string' },
            observations: { type: 'string' },
          },
          required: ['markdown'],
        },
      },
    },
    messages,
  });

  return JSON.parse(res.choices[0].message.content ?? '{}');
}

/* ------------------------------------------------------------------ */
/* MAIN                                                                */
/* ------------------------------------------------------------------ */
async function main() {
  console.log(chalk.cyan(`Transflating docs: ${FROM} → ${TO}\n`));

  const mdFiles = await readdir('src/app/pages/docs', { recursive: true });

  // Pre-load relevant API reports (core + both frameworks)
  const apiReports = await Promise.all(
    ['core', FROM, TO, 'azure', 'google', 'openai', 'writer'].map(
      loadApiReport,
    ),
  );

  for (const file of mdFiles.filter((p) => p.endsWith('.md'))) {
    if (!new RegExp(`[\\/\\\\]${FROM}[\\/\\\\]`, 'i').test(file)) continue;

    const srcPath = join('src/app/pages/docs', file);
    const srcMarkdown = await readFile(srcPath, 'utf8');

    const targetRelPath = file.replace(new RegExp(`\\b${FROM}\\b`, 'i'), TO);
    const targetPath = join('src/app/pages/docs', targetRelPath);

    let existingTargetMarkdown: string | undefined;
    try {
      existingTargetMarkdown = await readFile(targetPath, 'utf8');
    } catch {
      /* file may not exist – that's fine */
    }

    try {
      const { markdown, observations } = await transflateDoc({
        apiReports,
        fromFramework: FROM,
        toFramework: TO,
        sourceDoc: srcMarkdown,
        existingTargetDoc: existingTargetMarkdown,
        relPath: relative('src/app/pages/docs', srcPath),
      });

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, markdown, 'utf8');

      console.log(
        chalk.green.bold('✔'),
        chalk.green(`${relative('.', srcPath)} → ${relative('.', targetPath)}`),
      );
      if (observations) {
        console.log(chalk.gray('   notes:'), observations.trim());
      }
    } catch (err) {
      console.error(chalk.red.bold('✖'), chalk.red(`Failed for ${file}`));
      console.error(err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
