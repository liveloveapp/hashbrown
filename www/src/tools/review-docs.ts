import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import OpenAI from 'openai';
import chalk from 'chalk';

const openai = new OpenAI();

const MODEL = 'gpt-4.1';

async function review({
  apiReports,
  doc,
  path,
}: {
  apiReports: string[];
  doc: string;
  path: string;
}): Promise<{
  issues: {
    severity: 'minor' | 'important' | 'breaking';
    message: string;
    superShortSummary: string;
  }[];
  summary: string;
}> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'Review',
        schema: {
          type: 'object',
          properties: {
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  severity: {
                    type: 'string',
                    enum: ['minor', 'important', 'breaking'],
                  },
                  superShortSummary: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            summary: { type: 'string' },
          },
        },
      },
    },
    messages: [
      {
        role: 'system',
        content: `
          You are a senior TypeScript library maintainer. 
          Compare the Markdown docs with the public API. 
          Respond as JSON: { "issues": Issue[], "summary": string }.
          Each Issue: { "severity": "minor"|"important"|"breaking", "message": string }.
          List only REAL mismatches or missing explanations.

          ${apiReports.join('\n\n\n')}
        `,
      },
      {
        role: 'user',
        content: `
### Documentation (excerpt: ${path})
${doc}`,
      },
    ],
  });

  return JSON.parse(res.choices[0].message.content ?? '{}');
}

async function main() {
  const mdFiles = await readdir(`src/app/pages/docs`, {
    recursive: true,
  });
  for (const f of mdFiles.filter((p) => p.endsWith('.md'))) {
    const mdText = await readFile(join('src/app/pages/docs', f), 'utf8');

    const apiReports = await Promise.all([
      loadApiReport('core'),
      loadApiReport('angular'),
      loadApiReport('azure'),
      loadApiReport('google'),
      loadApiReport('openai'),
      loadApiReport('react'),
      loadApiReport('writer'),
    ]);

    function loadApiReport(packageName: string) {
      return readFile(
        join(`../packages/${packageName}/${packageName}.api.md`),
        'utf8',
      );
    }

    const out = await review({
      apiReports,
      doc: mdText,
      path: relative('src/app/pages/docs', f),
    });

    console.log(out.summary);

    if (out.issues.length) {
      console.log(`\n🔎 ${f}`);
      for (const i of out.issues) {
        switch (i.severity) {
          case 'minor':
            console.log(chalk.bold.gray(`[minor] ${i.superShortSummary}`));
            console.log(i.message);
            console.log();
            break;
          case 'important':
            console.log(
              chalk.bold.yellow(`[important] ${i.superShortSummary}`),
            );
            console.log(i.message);
            console.log();
            break;
          case 'breaking':
            console.log(chalk.bold.red(`[breaking] ${i.superShortSummary}`));
            console.log(i.message);
            console.log();
            break;
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
