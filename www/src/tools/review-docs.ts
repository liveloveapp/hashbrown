import 'dotenv/config';
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

          # Rules
          - If the doc has an obvious syntax error or miscalls an API, that's a breaking
            issue
          - Grammar, spelling, and formatting issues are important
          - Issues that you are not certain about are minor
          - Documentation should have these qualities:
            - Clear and concise
            - Easy to understand
            - Friendly and approachable

          # Concepts
          Some concepts may have _multiple names_ or ways of describing them. We
          want the documentation to be _consistent_ with its terminology. Please 
          ensure that the following concepts use these terms:
           - Tool Calling
           - Generative UI
           - Exposing Components
           - Skillet Schema

          If a different term is used than those above, flag it as a warning. 

          # API Reports
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
  const mdFiles = await readdir(`www/src/app/pages/docs`, {
    recursive: true,
  });
  for (const f of mdFiles.filter((p) => p.endsWith('.md'))) {
    // uncomment if you want to review a specific package
    // if (!f.includes('react')) {
    //   continue;
    // }

    const mdText = await readFile(join('www/src/app/pages/docs', f), 'utf8');

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
        join(`packages/${packageName}/${packageName}.api.md`),
        'utf8',
      );
    }

    const out = await review({
      apiReports,
      doc: mdText,
      path: relative('www/src/app/pages/docs', f),
    });

    console.log(out.summary);

    if (out.issues.length) {
      console.log(chalk.bgGreen.bold.black(`FILE: ${f}`));
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
